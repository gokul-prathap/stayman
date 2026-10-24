-- After 045: administrator configuration and owner sales preferences are separate.
begin;
alter table public.stayman_aiosell_connections
 add column if not exists auto_sync boolean not null default true,
 add column if not exists approved boolean not null default false,
 add column if not exists setup_verified boolean not null default false,
 add column if not exists manual_pending boolean not null default false,
 add column if not exists sales_ack jsonb not null default '{}',
 add column if not exists last_accepted_at timestamptz,
 add column if not exists resume_preferences jsonb,
 add column if not exists pending_scope text not null default 'FULL';
create table if not exists public.stayman_aiosell_remote (
 property_id uuid primary key references public.stayman_properties(id),hotel_code text not null,details jsonb not null,checked_at timestamptz not null default now());
create table if not exists public.stayman_aiosell_sites (
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.stayman_properties(id),target text not null,name text not null check(length(name) between 1 and 100),
 verified boolean not null default false,desired_open boolean not null default true,ack_open boolean,accepted_at timestamptz,unique(property_id,target));
alter table public.stayman_aiosell_remote enable row level security;
alter table public.stayman_aiosell_sites enable row level security;
revoke all on public.stayman_aiosell_remote,public.stayman_aiosell_sites from public,anon,authenticated;
grant all on public.stayman_aiosell_remote,public.stayman_aiosell_sites to service_role;
-- Backward-compatible queue behaviour for existing active properties; owner setup still needs verification.
update public.stayman_aiosell_connections set approved=enabled where not setup_verified;
update public.stayman_aiosell_connections c set mappings=coalesce((select jsonb_agg(m||jsonb_build_object('mappingId',coalesce(m->>'mappingId',md5(c.property_id::text||':'||(m->>'roomCode'))::uuid::text))) from jsonb_array_elements(c.mappings) m),'[]'::jsonb);
create or replace function public.stayman_aiosell_save_validated(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; plan jsonb; plans jsonb; cleaned jsonb:='[]'; seen text[]; prior public.stayman_aiosell_connections;
begin
 if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into prior from public.stayman_aiosell_connections where property_id=p_property for update;
 if jsonb_typeof(p_mappings) is distinct from 'array' then raise exception 'Invalid mappings.'; end if;
 -- Do not release/reassign active inventory or remove a published rate plan silently.
 if prior.enabled and exists(select 1 from jsonb_array_elements(prior.mappings) old where not exists(
  select 1 from jsonb_array_elements(p_mappings) fresh where fresh->>'roomCode'=old->>'roomCode'
  and fresh->'unitIds'=old->'unitIds'
  and not exists(select 1 from jsonb_array_elements(coalesce(old->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',old->>'rateplanCode')))) op
   where not exists(select 1 from jsonb_array_elements(coalesce(fresh->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',fresh->>'rateplanCode')))) np where np->>'rateplanCode'=op->>'rateplanCode'))))
 then raise exception 'Use Change mappings to close existing inventory before removing plans or changing assigned units.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  plans:=coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')));
  if jsonb_typeof(plans) is distinct from 'array' or jsonb_array_length(plans) not between 1 and 20 then raise exception 'Choose at least one rate plan per category.'; end if;
  seen:='{}';
  for plan in select value from jsonb_array_elements(plans) loop
   if coalesce(length(trim(plan->>'rateplanCode')),0) not between 1 and 120 or plan->>'rateplanCode'=any(seen) then raise exception 'Rate-plan codes must be distinct within a category.'; end if;
   seen:=array_append(seen,plan->>'rateplanCode');
   if plan->>'rateSource'='occupancy' and (coalesce(plan->>'guestCount','') !~ '^[1-9][0-9]?$' or m->'guestPricing' is null or (plan->>'guestCount')::int not between (m->'guestPricing'->>'includedGuests')::int and (m->'guestPricing'->>'maxGuests')::int) then raise exception 'Guest-count price needs valid configured occupancy rules.'; end if;
   if coalesce(plan->>'rateSource','pricing') not in ('pricing','fixed','occupancy') then raise exception 'Invalid rate source.'; end if;
   if plan->>'rateSource'='fixed' and (coalesce(plan->>'ratePaise','') !~ '^[0-9]{1,10}$' or (plan->>'ratePaise')::bigint not between 1 and 100000000) then raise exception 'Set a positive rate-plan price in Pricing.'; end if;
  end loop;
  cleaned:=cleaned||jsonb_build_array((m-'ratePaise')||jsonb_build_object('rateplanCode',plans->0->>'rateplanCode','ratePlans',plans,'ratePaise',0,'rateSource','pricing'));
 end loop;
 perform public.stayman_aiosell_save_config(p_property,p_hotel,p_enabled,cleaned);
end $$;
create or replace function public.stayman_aiosell_save_config(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; ids uuid[]; used uuid[]:='{}'; code text; codes text[]:='{}'; prior public.stayman_aiosell_connections; inventory_closed boolean;
begin
 if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into prior from public.stayman_aiosell_connections where property_id=p_property for update;
 inventory_closed:=not exists(select 1 from jsonb_array_elements(prior.mappings) x where (x->>'stopSell')::boolean is distinct from true)
   and (coalesce((prior.last_sync_results->>'revision')::bigint,-1)=prior.revision
     and prior.last_sync_results->'stages'->'inventory'->>'status'='sent'
     or prior.synced_revision=prior.revision and prior.last_error is null);
 if prior.enabled and (not p_enabled or prior.hotel_code<>trim(p_hotel)) and not coalesce(inventory_closed,false)
 then raise exception 'Tick Stop sell on every saved mapping, save and sync inventory before pausing. Restrictions may remain pending.'; end if;
 if prior.enabled and exists(select 1 from jsonb_array_elements(prior.mappings) old where not exists(select 1 from jsonb_array_elements(p_mappings) fresh where fresh->>'roomCode'=old->>'roomCode'))
 then raise exception 'Close the existing inventory and pause the connection before removing or renaming a room mapping.'; end if;
 if coalesce(length(trim(p_hotel)),0) not between 1 and 120 or jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings)>100 then raise exception 'Invalid connection settings.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  code:=m->>'roomCode';
  if coalesce(length(trim(code)),0)=0 then raise exception 'Enter a room code for every mapping or remove unfinished mappings.'; end if;
  if length(code)>120 then raise exception 'Room codes must be 120 characters or fewer.'; end if;
  if code=any(codes) then raise exception 'Room code "%" appears more than once. Each Aiosell room code must be unique.',code; end if;
  codes:=array_append(codes,code);
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(m->'unitIds');
  if coalesce(cardinality(ids),0)=0 or ids && used or cardinality(ids)<>(select count(distinct v) from unnest(ids) v)
    or exists(select 1 from unnest(ids) v where not exists(select 1 from public.stayman_units u where u.id=v and u.property_id=p_property and u.archived_at is null)) then raise exception 'Choose distinct active units from this property.'; end if;
  if (select count(distinct (u.unit_type,u.gender_policy)) from public.stayman_units u where u.id=any(ids))<>1 then raise exception 'A room mapping cannot mix beds, rooms or gender policies.'; end if;
  used:=used||ids;
  if coalesce(length(m->>'rateplanCode'),0) not between 1 and 120 or coalesce(m->>'ratePaise','') !~ '^[0-9]{1,10}$'
    or coalesce(m->>'minimumStay','') !~ '^[1-9][0-9]{0,2}$' or jsonb_typeof(m->'stopSell') is distinct from 'boolean' then raise exception 'Set a valid rate plan and restrictions.'; end if;
 end loop;
 if p_enabled and jsonb_array_length(p_mappings)=0 then raise exception 'Map inventory before enabling sync.'; end if;
 if exists(select 1 from public.stayman_aiosell_connections where property_id=p_property and hotel_code<>trim(p_hotel))
 and exists(select 1 from public.stayman_aiosell_bookings where property_id=p_property) then raise exception 'Hotel code cannot change after receiving bookings.'; end if;
 insert into public.stayman_aiosell_connections(property_id,hotel_code,enabled,mappings) values(p_property,trim(p_hotel),p_enabled,p_mappings)
 on conflict(property_id) do update set hotel_code=excluded.hotel_code,enabled=excluded.enabled,mappings=excluded.mappings,
 revision=stayman_aiosell_connections.revision+1,retry_at=now(),attempts=0,updated_at=now();
end $$;
create or replace function public.stayman_aiosell_save(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 perform public.stayman_aiosell_save_validated(p_property,p_hotel,p_enabled,p_mappings);
end $$;
create or replace function public.stayman_aiosell_store_remote(p_property uuid,p_hotel text,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_details->>'hotel_id' is distinct from p_hotel or jsonb_typeof(p_details->'rooms') is distinct from 'array' then raise exception 'Property details do not match.'; end if;
 insert into public.stayman_aiosell_remote(property_id,hotel_code,details) values(p_property,p_hotel,jsonb_build_object('hotel_id',p_hotel,'hotel_name',p_details->'hotel_name','currency',p_details->'currency','timezone',p_details->'timezone','rooms',p_details->'rooms','connected_channels',p_details->'connected_channels'))
 on conflict(property_id) do update set hotel_code=excluded.hotel_code,details=excluded.details,checked_at=now();
end $$;
create or replace function public.stayman_aiosell_configure(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; remote public.stayman_aiosell_remote; m jsonb; plan jsonb; room jsonb; cleaned jsonb:='[]';
begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 perform 1 from public.stayman_properties where id=p_property for update;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 if c.revision is distinct from p_revision then raise exception 'Configuration changed. Refresh and review again.'; end if;
 select * into remote from public.stayman_aiosell_remote where property_id=p_property and hotel_code=trim(p_hotel);
 if not found or remote.checked_at<now()-interval '24 hours' then raise exception 'Fetch and verify this property first.'; end if;
 if remote.details->>'currency'<>'INR' then raise exception 'Only INR properties are supported.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  select value into room from jsonb_array_elements(remote.details->'rooms') where value->>'room_id'=m->>'roomCode' and coalesce((value->>'active')::boolean,true);
  if room is null then raise exception 'Category not found in the verified property.'; end if;
  for plan in select value from jsonb_array_elements(coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode')))) loop
   if not exists(select 1 from jsonb_array_elements(room->'rateplans') p where p->>'rateplan_id'=plan->>'rateplanCode') then raise exception 'Rate plan not found in this category.'; end if;
   if plan->>'guestCount' is not null and exists(select 1 from jsonb_array_elements(room->'rateplans') p where p->>'rateplan_id'=plan->>'rateplanCode' and p->>'occupancy' is not null and (p->>'occupancy')::int<>(plan->>'guestCount')::int) then raise exception 'Guest count does not match the Aiosell rate plan. Ask Aiosell to configure the correct occupancy first.'; end if;
  end loop;
  if m ? 'guestPricing' and m->'guestPricing'<>'null'::jsonb then
   if coalesce(m->'guestPricing'->>'includedGuests','') !~ '^[1-9][0-9]?$' or coalesce(m->'guestPricing'->>'maxGuests','') !~ '^[1-9][0-9]?$'
    or (m->'guestPricing'->>'maxGuests')::int<(m->'guestPricing'->>'includedGuests')::int
    or (m->'guestPricing'->>'maxGuests')::int>coalesce((room->>'max_occ')::int,99)
    or coalesce(m->'guestPricing'->>'extraGuestPaise','') !~ '^[0-9]{1,9}$' then raise exception 'Check included guests, maximum occupancy and extra-guest price.'; end if;
  end if;
  if not c.enabled and c.resume_preferences is not null and exists(select 1 from jsonb_array_elements_text(m->'unitIds') id where c.resume_preferences ? id) then
   m:=m||jsonb_build_object('stopSell',exists(select 1 from jsonb_array_elements_text(m->'unitIds') id where c.resume_preferences->>id='false'));
  end if;
  cleaned:=cleaned||jsonb_build_array(m||jsonb_build_object('mappingId',coalesce((select old->>'mappingId' from jsonb_array_elements(c.mappings) old where old->>'roomCode'=m->>'roomCode'),gen_random_uuid()::text),'roomName',room->>'room_name'));
 end loop;
 if c.enabled and p_enabled and not exists(select 1 from jsonb_array_elements(cleaned) entry where (entry->>'stopSell')::boolean is distinct from true) and exists(select 1 from jsonb_array_elements(c.mappings) entry where not (entry->>'stopSell')::boolean) then
  update public.stayman_aiosell_connections set resume_preferences=(select jsonb_object_agg(id,not (entry->>'stopSell')::boolean) from jsonb_array_elements(c.mappings) entry,lateral jsonb_array_elements_text(entry->'unitIds') id) where property_id=p_property;
 end if;
 perform public.stayman_aiosell_save_validated(p_property,p_hotel,p_enabled,cleaned);
 if c.hotel_code is not null and c.hotel_code<>trim(p_hotel) then
  delete from public.stayman_aiosell_sites where property_id=p_property;
  update public.stayman_aiosell_connections set restriction_channels='{}',sales_ack='{}',last_accepted_at=null,last_synced_at=null where property_id=p_property;
 end if;
 update public.stayman_aiosell_connections set setup_verified=true,approved=case when p_enabled then approved else false end,manual_pending=p_enabled,retry_at=now() where property_id=p_property;
end $$;
create or replace function public.stayman_aiosell_settings(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 return jsonb_build_object('connection',(select to_jsonb(c)-'lease'-'lease_until' from public.stayman_aiosell_connections c where property_id=p_property),
 'remote',(select details from public.stayman_aiosell_remote where property_id=p_property),
 'sites',coalesce((select jsonb_agg(to_jsonb(s)) from public.stayman_aiosell_sites s where property_id=p_property),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'payload') from (select * from public.stayman_aiosell_events where property_id=p_property order by received_at desc limit 30) e),'[]'::jsonb));
end $$;
create or replace function public.stayman_aiosell_channels(p_property uuid,p_channels text[]) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 if p_channels is null or cardinality(p_channels)>50 or exists(select 1 from unnest(p_channels) c where c is null or c !~ '^[A-Za-z0-9._-]{1,120}$') then raise exception 'Invalid restriction identifiers.'; end if;
 update public.stayman_aiosell_connections set restriction_channels=p_channels,revision=revision+1,retry_at=now() where property_id=p_property;
end $$;
drop function if exists public.stayman_aiosell_site_setup(uuid,text,text,boolean);
create or replace function public.stayman_aiosell_site_setup(p_property uuid,p_target text,p_name text,p_verified boolean,p_accept boolean default false) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 if not exists(select 1 from public.stayman_aiosell_remote r join public.stayman_aiosell_connections c using(property_id,hotel_code),lateral jsonb_array_elements(r.details->'connected_channels') ch where r.property_id=p_property and ch->>'partner_id'=p_target and ch->>'operation'='inventory') then raise exception 'This target is not a returned inventory channel. Refresh property details or ask Aiosell to fix access.'; end if;
 insert into public.stayman_aiosell_sites(property_id,target,name,verified,desired_open) values(p_property,p_target,trim(p_name),p_verified,p_accept)
 on conflict(property_id,target) do update set name=excluded.name,verified=excluded.verified;
 update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=p_property;
end $$;
create or replace function public.stayman_aiosell_plan_prices(p_property uuid,p_revision bigint,p_prices jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; entry jsonb; maps jsonb; seen text[]:='{}'; key text;
begin
 if public.stayman_is_owner(p_property) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 if not found or c.revision<>p_revision then raise exception 'Configuration changed. Refresh prices and try again.'; end if;
 if jsonb_typeof(p_prices) is distinct from 'array' or jsonb_array_length(p_prices)>2000 then raise exception 'Invalid plan prices.'; end if;
 maps:=c.mappings;
 for entry in select value from jsonb_array_elements(p_prices) loop
  key:=concat(entry->>'roomCode',':',entry->>'rateplanCode');
  if key=any(seen) then raise exception 'Duplicate plan price.'; end if; seen:=array_append(seen,key);
  if not exists(select 1 from jsonb_array_elements(maps) m cross join lateral jsonb_array_elements(coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')))) plan where m->>'roomCode'=entry->>'roomCode' and plan->>'rateplanCode'=entry->>'rateplanCode') then raise exception 'Rate plan is no longer mapped.'; end if;
  select jsonb_agg(case when m->>'roomCode'=entry->>'roomCode' then m||jsonb_build_object('ratePlans',(select jsonb_agg(case when plan->>'rateplanCode'=entry->>'rateplanCode' then plan||jsonb_build_object('rateSource',entry->>'rateSource','ratePaise',entry->'ratePaise') else plan end) from jsonb_array_elements(coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')))) plan)) else m end) into maps from jsonb_array_elements(maps) m;
 end loop;
 perform public.stayman_aiosell_save_validated(p_property,c.hotel_code,c.enabled,maps);
end $$;

create or replace function public.stayman_aiosell_ready(p_property uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select c.setup_verified and jsonb_array_length(c.mappings)>0 and exists(select 1 from public.stayman_aiosell_remote r where r.property_id=p_property and r.hotel_code=c.hotel_code and r.details->>'currency'='INR')
 and not exists(select 1 from jsonb_array_elements(public.stayman_aiosell_resolved_rates(p_property)) m where m->>'priceError' is not null)
 and not exists(select 1 from jsonb_array_elements(c.mappings) m where exists(select 1 from public.stayman_units u where u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds')) and u.unit_type='ROOM') and (m->'guestPricing' is null or m->'guestPricing'='null'::jsonb))
 and not exists(select 1 from jsonb_array_elements(c.mappings) m cross join lateral generate_series(coalesce((m->'guestPricing'->>'includedGuests')::int,1),coalesce((m->'guestPricing'->>'maxGuests')::int,0)) guests(n)
  where not exists(select 1 from jsonb_array_elements(coalesce(m->'ratePlans','[]')) plan where (plan->>'guestCount')::int=guests.n and plan->>'rateSource'='occupancy'))
 from public.stayman_aiosell_connections c where c.property_id=p_property),false);
$$;
create or replace function public.stayman_aiosell_owner_state(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; ready boolean; start_day date; property_name text; output jsonb;
begin
 if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property;
 select name,(now() at time zone coalesce(timezone,'Asia/Kolkata'))::date into property_name,start_day from public.stayman_properties where id=p_property;
 if c.property_id is null then return jsonb_build_object('state','UNCONFIGURED','propertyName',property_name,'rooms','[]'::jsonb,'sites','[]'::jsonb,'issues','[]'::jsonb); end if;
 ready:=public.stayman_aiosell_ready(p_property);
 output:=jsonb_build_object('state',case when not ready then 'INCOMPLETE' when not c.approved then 'READY' when c.last_synced_at is null then 'ACTIVATING' else 'CONNECTED' end,
 'propertyName',coalesce((select details->>'hotel_name' from public.stayman_aiosell_remote where property_id=p_property and hotel_code=c.hotel_code),property_name),
 'reason',case when not c.setup_verified then 'Your administrator needs to verify the property and room matches.' when not ready then 'Room matches, guest limits or prices need administrator attention.' else null end,
 'canConfigure',public.stayman_is_platform_admin(),'autoSync',c.auto_sync,'enabled',c.enabled,'approved',c.approved,'ready',ready,'revision',c.revision,'pending',c.enabled and (c.manual_pending or (c.auto_sync and c.revision>c.synced_revision)),
 'deliveryFailed',c.last_error is not null,'lastAcceptedAt',c.last_accepted_at,'scope',jsonb_build_object('from',start_day,'through',start_day+89),
 'rooms',coalesce((select jsonb_agg(jsonb_build_object('key',m->>'mappingId','name',(select string_agg(concat_ws(' / ',nullif(u.room_name,''),u.label),', ' order by u.room_name,u.label) from public.stayman_units u where u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))),
 'category',coalesce(m->>'roomName','Matched online category'),'price',m->'ratePaise','priceIssue',m->'priceError','included',true,'desiredOpen',not (m->>'stopSell')::boolean,
 'ackOpen',c.sales_ack->(m->>'mappingId'),'pending',c.manual_pending and (c.sales_ack->(m->>'mappingId') is distinct from to_jsonb(not (m->>'stopSell')::boolean)),
 'guestPricing',m->'guestPricing','guestPrices',(select coalesce(jsonb_agg(jsonb_build_object('guests',plan->'guestCount','price',plan->'ratePaise')) filter(where plan->>'guestCount' is not null),'[]'::jsonb) from jsonb_array_elements(coalesce(m->'ratePlans','[]')) plan))) from jsonb_array_elements(public.stayman_aiosell_resolved_rates(p_property)) m),'[]'::jsonb),
 'excluded',coalesce((select jsonb_agg(jsonb_build_object('name',concat_ws(' / ',nullif(u.room_name,''),u.label),'price',u.nightly_rate_paise)) from public.stayman_units u where u.property_id=p_property and u.archived_at is null and not exists(select 1 from jsonb_array_elements(c.mappings) m where m->'unitIds' ? u.id::text)),'[]'::jsonb),
 'sites',coalesce((select jsonb_agg(jsonb_build_object('key',id,'name',name,'configured',verified,'desiredOpen',desired_open,'ackOpen',ack_open,'acceptedAt',accepted_at,'pending',c.manual_pending and ack_open is distinct from desired_open)) from public.stayman_aiosell_sites where property_id=p_property),'[]'::jsonb),
 'issues',coalesce((select jsonb_agg(jsonb_build_object('key',e.id,'reference',e.booking_id,'channel',e.channel,'guest',e.payload->'guest'->>'name','from',e.payload->>'checkin','through',e.payload->>'checkout','rooms',(select string_agg(coalesce(m->>'roomName','Unmatched online room'),', ') from jsonb_array_elements(e.payload->'rooms') er left join lateral(select value m from jsonb_array_elements(c.mappings) where value->>'roomCode'=er->>'roomCode') match on true),
 'reason',case when e.issue like '%available%' then 'A suitable room or bed could not be allocated.' when e.issue like '%mapped%' then 'Your administrator needs to check the room match.' when e.action='modify' then 'The booking changed. Review its dates, rooms and price.' when e.action='cancel' then 'Check the cancellation and any money to return.' else 'Check this booking against the latest details in Aiosell.' end)) from (select * from public.stayman_aiosell_events where property_id=p_property and status='REVIEW' order by received_at desc limit 30) e),'[]'::jsonb));
 return output;
end $$;
create or replace function public.stayman_aiosell_owner_action(p_property uuid,p_action text,p_key uuid,p_open boolean,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; m jsonb;
begin
 if public.stayman_is_owner(p_property) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 if c.revision is distinct from p_revision then raise exception 'The offering changed. Refresh and review again.'; end if;
 if not public.stayman_aiosell_ready(p_property) then raise exception 'Ask your administrator to finish setup.'; end if;
 if p_action='approve' then
  update public.stayman_aiosell_connections set approved=true,enabled=true,resume_preferences=null,manual_pending=true,pending_scope='FULL',revision=revision+1,retry_at=now(),attempts=0,last_error=null where property_id=p_property; return;
 end if;
 if not c.approved or not c.enabled then raise exception 'Review and start online sales first.'; end if;
 if p_action='auto' then
  if p_open is null then raise exception 'Choose the update preference.'; end if;
  update public.stayman_aiosell_connections set auto_sync=p_open,revision=revision+case when p_open and not auto_sync then 1 else 0 end,retry_at=now(),attempts=0 where property_id=p_property; return;
 elsif p_action='room' then
  select value into m from jsonb_array_elements(c.mappings) where value->>'mappingId'=p_key::text;
  if m is null or p_open is null then raise exception 'Room is not configured.'; end if;
  if c.manual_pending and c.sales_ack->p_key::text is distinct from to_jsonb(not (m->>'stopSell')::boolean) and (m->>'stopSell')::boolean=p_open then raise exception 'An update is pending. Retry it before changing this room again.'; end if;
  update public.stayman_aiosell_connections set mappings=(select jsonb_agg(case when x->>'mappingId'=p_key::text then x||jsonb_build_object('stopSell',not p_open) else x end) from jsonb_array_elements(c.mappings) x) where property_id=p_property;
 elsif p_action='site' then
  if p_open is null or not exists(select 1 from public.stayman_aiosell_sites where id=p_key and property_id=p_property and verified) then raise exception 'This booking site needs administrator setup.'; end if;
  if exists(select 1 from public.stayman_aiosell_sites where id=p_key and property_id=p_property and c.manual_pending and ack_open is distinct from desired_open and desired_open is distinct from p_open) then raise exception 'A booking-site update is pending. Retry before changing it again.'; end if;
  update public.stayman_aiosell_sites set desired_open=p_open where id=p_key and property_id=p_property;
 elsif p_action='stop_all' then
  update public.stayman_aiosell_connections set mappings=(select jsonb_agg(x||jsonb_build_object('stopSell',true)) from jsonb_array_elements(c.mappings) x) where property_id=p_property;
 elsif p_action<>'retry' then raise exception 'Unknown sales action.';
 end if;
 update public.stayman_aiosell_connections set manual_pending=true,pending_scope=case when p_action='retry' then pending_scope when auto_sync then 'FULL' else 'SALES' end,revision=revision+1,retry_at=now(),attempts=0,last_error=null where property_id=p_property;
end $$;
create or replace function public.stayman_aiosell_resolved_rates(p_property uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((m-'ratePaise')||jsonb_build_object('ratePaise',case when n=expected and variants=1 and price>0 then price else null end,
  'priceError',case when n<>expected or n=0 then 'Mapped units are missing or archived.' when variants<>1 then 'Mapped units have different prices.' when price<=0 then 'Set a positive price in Pricing.' else null end,
  'ratePlans',(select jsonb_agg(plan||jsonb_build_object('ratePaise',case when plan->>'rateSource'='occupancy' then price+greatest(0,(plan->>'guestCount')::int-(m->'guestPricing'->>'includedGuests')::int)*(m->'guestPricing'->>'extraGuestPaise')::bigint when plan->>'rateSource'='fixed' then (plan->>'ratePaise')::bigint when n=expected and variants=1 and price>0 then price else null end))
   from jsonb_array_elements(coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')))) plan)) order by position),'[]'::jsonb)
 from public.stayman_aiosell_connections c cross join lateral jsonb_array_elements(c.mappings) with ordinality entries(m,position)
 cross join lateral(select count(*) n,count(distinct nightly_rate_paise) variants,min(nightly_rate_paise) price from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))) prices
 cross join lateral(select jsonb_array_length(m->'unitIds') expected) size where c.property_id=p_property;
$$;
create or replace function public.stayman_aiosell_claim_inventory(p_property uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; token uuid:=gen_random_uuid(); start_day date; inventory jsonb; blocked boolean;
begin
 select * into c from public.stayman_aiosell_connections where enabled and (auto_sync or manual_pending) and (p_property is null or property_id=p_property)
 and (revision>synced_revision or last_synced_at is null or last_synced_at<now()-interval '12 hours')
 and retry_at<=now() and (lease_until is null or lease_until<now()) order by retry_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.stayman_aiosell_connections set lease=token,lease_until=now()+interval '2 minutes' where property_id=c.property_id;
 select (now() at time zone coalesce(timezone,'Asia/Kolkata'))::date into start_day from public.stayman_properties where id=c.property_id;
 blocked:=false;
 select jsonb_agg(jsonb_build_object('startDate',d::date,'endDate',d::date,'rooms',
  (select jsonb_agg(jsonb_build_object('roomCode',m->>'roomCode','available',case when (m->>'stopSell')::boolean or exists(select 1 from public.stayman_aiosell_events e,lateral jsonb_array_elements(e.payload->'rooms') er where e.property_id=c.property_id and e.status='REVIEW' and er->>'roomCode'=m->>'roomCode') then 0 else
    (select count(*) from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null
     and u.id in (select value::uuid from jsonb_array_elements_text(m->'unitIds'))
     and not exists(select 1 from public.stayman_allocations a where a.unit_id=u.id and a.check_in_date<=d::date and a.check_out_date>d::date)) end))
   from jsonb_array_elements(c.mappings) m))) into inventory
 from generate_series(start_day::timestamp,(start_day+89)::timestamp,interval '1 day') d;
 return jsonb_build_object('property',c.property_id,'hotelCode',c.hotel_code,'lease',token,'revision',c.revision,'startDate',start_day,'endDate',start_day+89,'mappings',c.mappings,'updates',inventory,'blocked',false,'blockedRooms',(select coalesce(jsonb_agg(distinct er->>'roomCode'),'[]') from public.stayman_aiosell_events e,lateral jsonb_array_elements(e.payload->'rooms') er where e.property_id=c.property_id and e.status='REVIEW'),
 'sales',jsonb_build_object('rooms',(select jsonb_object_agg(m->>'mappingId',not (m->>'stopSell')::boolean) from jsonb_array_elements(c.mappings) m)),
 'salesOnly',not c.auto_sync and c.manual_pending and c.pending_scope='SALES','siteSetupCount',(select count(*) from public.stayman_aiosell_sites where property_id=c.property_id),'sites',coalesce((select jsonb_agg(jsonb_build_object('key',id,'target',target,'open',desired_open)) from public.stayman_aiosell_sites where property_id=c.property_id and verified),'[]'::jsonb));
end $$;

create or replace function public.stayman_aiosell_finish_delivery(p_property uuid,p_lease uuid,p_revision bigint,p_results jsonb,p_sales jsonb,p_sites jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; site jsonb;
begin
 select * into c from public.stayman_aiosell_connections where property_id=p_property and lease=p_lease for update;
 if not found then return; end if;
 -- Acceptance is recorded independently of current revision. An older acknowledgement never confirms a newer desired value.
 if p_results->'inventory'->>'status'='sent' then
  update public.stayman_aiosell_connections set sales_ack=coalesce(p_sales->'rooms','{}'),last_accepted_at=now() where property_id=p_property;
 end if;
 for site in select value from jsonb_array_elements(coalesce(p_sites,'[]')) loop
  if p_results->'restrictions'->'channels'->(site->>'key')->>'status'='sent' then
   update public.stayman_aiosell_sites set ack_open=(site->>'open')::boolean,accepted_at=now() where id=(site->>'key')::uuid and property_id=p_property;
  end if;
 end loop;
 if c.revision=p_revision and p_error is null then update public.stayman_aiosell_connections set manual_pending=false where property_id=p_property; end if;
 perform public.stayman_aiosell_finish_result(p_property,p_lease,p_revision,p_results,p_error);
end $$;
-- Owner-facing pricing contains readable names and guest rules, not remote mapping IDs.
create or replace function public.stayman_aiosell_pricing_status(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare state jsonb; begin
 state:=public.stayman_aiosell_owner_state(p_property);
 return jsonb_build_object('status',case when state->>'state'='UNCONFIGURED' then 'not_configured' when (state->>'deliveryFailed')::boolean then 'failed' when (state->>'pending')::boolean then 'pending' when not coalesce((state->>'autoSync')::boolean,false) then 'paused' else 'sent' end,
 'enabled',coalesce((state->>'autoSync')::boolean,false) and coalesce((state->>'approved')::boolean,false),'revision',state->'revision','mappings',state->'rooms');
end $$;
create or replace function public.stayman_aiosell_extra_price(p_property uuid,p_key uuid,p_amount bigint,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; begin
 if public.stayman_is_owner(p_property) is distinct from true then raise exception 'Owner access required.'; end if;
 if p_amount is null or p_amount not between 0 and 100000000 then raise exception 'Invalid extra-guest price.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 if c.revision is distinct from p_revision then raise exception 'Prices changed. Refresh and try again.'; end if;
 if not exists(select 1 from jsonb_array_elements(c.mappings) m where m->>'mappingId'=p_key::text and m->'guestPricing' is not null) then raise exception 'Ask your administrator to configure guest limits first.'; end if;
 update public.stayman_aiosell_connections set mappings=(select jsonb_agg(case when m->>'mappingId'=p_key::text then jsonb_set(m,'{guestPricing,extraGuestPaise}',to_jsonb(p_amount)) else m end) from jsonb_array_elements(c.mappings) m),revision=revision+1,retry_at=now(),attempts=0 where property_id=p_property;
end $$;

create or replace function public.stayman_aiosell_review(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.stayman_aiosell_events; begin
 select * into e from public.stayman_aiosell_events where id=p_event;
 if not found or public.stayman_is_owner(e.property_id) is distinct from true then raise exception 'Owner access required.'; end if;
 return jsonb_build_object('reference',e.booking_id,'action',e.action,'guest',e.payload->'guest'->>'name','from',e.payload->>'checkin','through',e.payload->>'checkout','total',e.payload->'totalPaise','canCreate',e.action='book' and e.status='REVIEW',
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('key',r.id,'reference',r.booking_ref,'guest',g.full_name,'from',r.check_in_date,'through',r.check_out_date,'total',r.total_amount,'status',r.status,'rooms',(select string_agg(concat_ws(' / ',u.room_name,u.label),', ') from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id where a.reservation_id=r.id))) from (select * from public.stayman_reservations where property_id=e.property_id and (id in(select reservation_id from public.stayman_aiosell_bookings where property_id=e.property_id and channel=e.channel and booking_id=e.booking_id) or (check_in_date=(e.payload->>'checkin')::date and check_out_date=(e.payload->>'checkout')::date)) order by created_at desc limit 30) r left join public.stayman_guests g on g.id=r.guest_id),'[]'::jsonb));
end $$;
create or replace function public.stayman_aiosell_create_reviewed(p_event uuid,p_verified boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.stayman_aiosell_events; c public.stayman_aiosell_connections; p_payload jsonb; b public.stayman_aiosell_bookings;
 room jsonb; mapping jsonb; u uuid; g uuid; rid uuid; arrive date; depart date; contact_phone text; room_index integer:=0;
begin
 select * into e from public.stayman_aiosell_events where id=p_event;
 if not found or public.stayman_is_owner(e.property_id) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=e.property_id for update;
 select * into e from public.stayman_aiosell_events where id=p_event for update;
 select * into b from public.stayman_aiosell_bookings where property_id=e.property_id and channel=e.channel and booking_id=e.booking_id;
 if b.reservation_id is not null then return b.reservation_id; end if;
 if p_verified is distinct from true or e.action<>'book' or e.status<>'REVIEW' or b.cancelled then raise exception 'Verify the latest new booking before creating it.'; end if;
 if exists(select 1 from public.stayman_aiosell_events newer where newer.property_id=e.property_id and newer.channel=e.channel and newer.booking_id=e.booking_id and (newer.received_at,newer.id)>(e.received_at,e.id)) then raise exception 'A newer delivery exists. Review the latest booking first.'; end if;
 p_payload:=e.payload;arrive:=(p_payload->>'checkin')::date;depart:=(p_payload->>'checkout')::date;
 if exists(select 1 from public.stayman_reservations r join public.stayman_guests guest on guest.id=r.guest_id where r.property_id=e.property_id and r.check_in_date=arrive and r.check_out_date=depart and r.status<>'CANCELLED' and lower(trim(guest.full_name))=lower(trim(p_payload->'guest'->>'name'))) then raise exception 'A matching guest and stay already exists. Check and link that reservation instead.'; end if;
   contact_phone:=nullif(trim(p_payload->'guest'->>'phone'),'');
   -- OTA numbers must be explicit international numbers; do not guess a country.
   if contact_phone is not null then
    contact_phone:=regexp_replace(contact_phone,'[() .-]','','g');
    if contact_phone !~ '^\+[1-9][0-9]{6,14}$' or not public.stayman_phone_length_valid(contact_phone) then contact_phone:=null; end if;
   end if;
   insert into public.stayman_guests(property_id,full_name,phone,email,gender,ota_contact_withheld) values(c.property_id,p_payload->'guest'->>'name',contact_phone,p_payload->'guest'->>'email','OTHER',contact_phone is null) returning id into g;
   insert into public.stayman_reservations(property_id,guest_id,booking_ref,check_in_date,check_out_date,total_amount,source,notes)
   values(c.property_id,g,'OTA-'||gen_random_uuid(),arrive,depart,(p_payload->>'totalPaise')::bigint,p_payload->>'channel',concat_ws(E'\n',nullif(p_payload->>'specialRequests',''),case when contact_phone is null then 'OTA phone missing or invalid. Obtain a verified contact number at check-in.' end)) returning id into rid;
   for room in select value from jsonb_array_elements(p_payload->'rooms') loop
    select value into mapping from jsonb_array_elements(c.mappings) where value->>'roomCode'=room->>'roomCode' and (value->>'rateplanCode'=room->>'rateplanCode' or exists(select 1 from jsonb_array_elements(coalesce(value->'ratePlans','[]'::jsonb)) plan where plan->>'rateplanCode'=room->>'rateplanCode'));
    if mapping is null then raise exception 'Room or rate plan is not mapped.'; end if;
    -- Gender-restricted inventory needs verified guest details before allocation.
    select id into u from public.stayman_units x where property_id=c.property_id and archived_at is null and gender_policy='ANY'
    and id in (select value::uuid from jsonb_array_elements_text(mapping->'unitIds'))
    and not exists(select 1 from public.stayman_allocations a where a.unit_id=x.id and a.check_in_date<depart and a.check_out_date>arrive)
    order by id for update limit 1;
    if u is null then raise exception 'No suitable available unit; staff allocation required.'; end if;
    insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
    values(c.property_id,rid,u,arrive,depart,'PENDING',(p_payload->>'totalPaise')::bigint/jsonb_array_length(p_payload->'rooms')
      +case when room_index=0 then (p_payload->>'totalPaise')::bigint%jsonb_array_length(p_payload->'rooms') else 0 end);
    room_index:=room_index+1;
   end loop;
   insert into public.stayman_aiosell_bookings(property_id,channel,booking_id,reservation_id) values(c.property_id,p_payload->>'channel',p_payload->>'bookingId',rid);

 update public.stayman_aiosell_events set status='APPLIED',issue='Reservation created after owner review.' where id=e.id;
 update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=e.property_id;
 return rid;
end $$;
-- Keep detailed reconciliation as a private implementation, with explicit human verification at the public boundary.
do $$ begin
 if to_regprocedure('public.stayman_aiosell_resolve_checked(uuid,text)') is null then alter function public.stayman_aiosell_resolve(uuid,text) rename to stayman_aiosell_resolve_checked; end if;
end $$;
create or replace function public.stayman_aiosell_resolve(p_event uuid,p_reservation text) returns void
language plpgsql security definer set search_path='' as $$ begin raise exception 'Open Review booking and verify the latest details before linking.'; end $$;
create or replace function public.stayman_aiosell_link_reviewed(p_event uuid,p_reservation uuid,p_verified boolean) returns void
language plpgsql security definer set search_path='' as $$
declare e public.stayman_aiosell_events; begin
 select * into e from public.stayman_aiosell_events where id=p_event;
 if not found or public.stayman_is_owner(e.property_id) is distinct from true then raise exception 'Owner access required.'; end if;
 perform 1 from public.stayman_aiosell_connections where property_id=e.property_id for update;
 if e.status='APPLIED' and exists(select 1 from public.stayman_aiosell_bookings where property_id=e.property_id and channel=e.channel and booking_id=e.booking_id and reservation_id=p_reservation) then return; end if;
 if exists(select 1 from public.stayman_aiosell_events newer where newer.property_id=e.property_id and newer.channel=e.channel and newer.booking_id=e.booking_id and (newer.received_at,newer.id)>(e.received_at,e.id)) then raise exception 'A newer delivery exists. Review the latest booking first.'; end if;
 if p_verified is distinct from true then raise exception 'Verify guest, stay dates, rooms and total first.'; end if;
 perform public.stayman_aiosell_resolve_checked(p_event,p_reservation::text);
end $$;
-- Internal helpers cannot be called directly by browser users.
revoke all on function public.stayman_aiosell_save_validated(uuid,text,boolean,jsonb),public.stayman_aiosell_ready(uuid),public.stayman_aiosell_resolve_checked(uuid,text),public.stayman_aiosell_save_config(uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.stayman_aiosell_store_remote(uuid,text,jsonb),public.stayman_aiosell_finish_delivery(uuid,uuid,bigint,jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.stayman_aiosell_store_remote(uuid,text,jsonb),public.stayman_aiosell_finish_delivery(uuid,uuid,bigint,jsonb,jsonb,jsonb,text) to service_role;
revoke all on function public.stayman_aiosell_owner_state(uuid),public.stayman_aiosell_owner_action(uuid,text,uuid,boolean,bigint),public.stayman_aiosell_site_setup(uuid,text,text,boolean,boolean),public.stayman_aiosell_extra_price(uuid,uuid,bigint,bigint),public.stayman_aiosell_review(uuid),public.stayman_aiosell_create_reviewed(uuid,boolean),public.stayman_aiosell_link_reviewed(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.stayman_aiosell_owner_state(uuid),public.stayman_aiosell_owner_action(uuid,text,uuid,boolean,bigint),public.stayman_aiosell_site_setup(uuid,text,text,boolean,boolean),public.stayman_aiosell_extra_price(uuid,uuid,bigint,bigint),public.stayman_aiosell_review(uuid),public.stayman_aiosell_create_reviewed(uuid,boolean),public.stayman_aiosell_link_reviewed(uuid,uuid,boolean) to authenticated;
do $migrate_schedule$ declare existing boolean; begin
 if to_regclass('cron.job') is not null then
  execute 'select exists(select 1 from cron.job where jobname=''stayman-aiosell-sync'')' into existing;
  if existing then
   execute $schedule_sql$select cron.schedule('stayman-aiosell-sync','* * * * *',$job$
    select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name='stayman_project_url')||'/functions/v1/aiosell-sync',
     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='stayman_aiosell_worker_secret')),
     body := '{"action":"sync"}'::jsonb,timeout_milliseconds:=90000)
    from (select property_id from public.stayman_aiosell_connections where enabled and (auto_sync or manual_pending)
      and (revision>synced_revision or last_synced_at is null or last_synced_at<now()-interval '12 hours')
      and retry_at<=now() and (lease_until is null or lease_until<now()) order by retry_at limit 10) pending;
   $job$)$schedule_sql$;
  end if;
 end if;
end $migrate_schedule$;
notify pgrst,'reload schema';
commit;
