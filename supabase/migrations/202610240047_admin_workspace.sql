-- Additive administration workspace. No invoice, mapping or membership data is removed.
begin;
-- Keep candidate lookups separate from the saved hotel's verified snapshot.
-- Previewing another hotel must not make the active owner connection incomplete.
do $$ begin
 if exists(select 1 from pg_constraint where conrelid='public.stayman_aiosell_remote'::regclass and contype='p' and cardinality(conkey)=1) then
  alter table public.stayman_aiosell_remote drop constraint stayman_aiosell_remote_pkey;
  alter table public.stayman_aiosell_remote add primary key(property_id,hotel_code);
 end if;
end $$;
create or replace function public.stayman_aiosell_store_remote(p_property uuid,p_hotel text,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_details->>'hotel_id' is distinct from p_hotel or jsonb_typeof(p_details->'rooms') is distinct from 'array' then raise exception 'Property details do not match.';end if;
 insert into public.stayman_aiosell_remote(property_id,hotel_code,details) values(p_property,p_hotel,jsonb_build_object('hotel_id',p_hotel,'hotel_name',p_details->'hotel_name','currency',p_details->'currency','timezone',p_details->'timezone','rooms',p_details->'rooms','connected_channels',p_details->'connected_channels'))
 on conflict(property_id,hotel_code) do update set details=excluded.details,checked_at=now();
end $$;
create or replace function public.stayman_aiosell_settings(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.';end if;
 return jsonb_build_object('connection',(select to_jsonb(c)-'lease'-'lease_until' from public.stayman_aiosell_connections c where property_id=p_property),
 'remote',(select r.details from public.stayman_aiosell_remote r join public.stayman_aiosell_connections c using(property_id,hotel_code) where r.property_id=p_property),
 'sites',coalesce((select jsonb_agg(to_jsonb(s)) from public.stayman_aiosell_sites s where property_id=p_property),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'payload') from (select * from public.stayman_aiosell_events where property_id=p_property order by received_at desc limit 30) e),'[]'::jsonb));
end $$;
create table if not exists public.stayman_admin_activity (
 id uuid primary key default gen_random_uuid(),property_id uuid references public.stayman_properties(id),actor uuid references auth.users(id),
 action text not null,outcome text not null default 'Saved',details jsonb not null default '{}',created_at timestamptz not null default now());
create index if not exists stayman_admin_activity_property_time on public.stayman_admin_activity(property_id,created_at desc);
alter table public.stayman_admin_activity enable row level security;
revoke all on public.stayman_admin_activity from public,anon,authenticated;
create or replace function public.stayman_capture_admin_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_data jsonb; after_data jsonb; selected_property uuid; action_name text; result text:='Saved'; actor_id uuid:=auth.uid(); changed jsonb:='{}'; begin
 before_data:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_data:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 selected_property:=coalesce((after_data->>'property_id')::uuid,(before_data->>'property_id')::uuid);
 if tg_table_name='stayman_properties' then
  selected_property:=coalesce((after_data->>'id')::uuid,(before_data->>'id')::uuid);
  if after_data=before_data then return null; end if;
  action_name:=case when tg_op='INSERT' then 'Property created' else 'Property details changed' end;
 elsif tg_table_name='stayman_staff' then
  if tg_op='UPDATE' and after_data->>'role' is not distinct from before_data->>'role' then return null; end if;
  action_name:=case when tg_op='INSERT' then 'Property access granted' when tg_op='DELETE' then 'Property access removed' else 'Property role changed' end;
  changed:=jsonb_build_object('role',coalesce(after_data->>'role',before_data->>'role'));
 elsif tg_table_name='stayman_aiosell_connections' then
  if tg_op='INSERT' then action_name:='Aiosell association prepared';
  elsif after_data->>'hotel_code' is distinct from before_data->>'hotel_code' then action_name:='Aiosell property code changed';
  elsif after_data->'mappings' is distinct from before_data->'mappings' then action_name:='Online room settings changed';
  elsif nullif(after_data->>'last_error','') is distinct from nullif(before_data->>'last_error','') then
   if nullif(after_data->>'last_error','') is not null then action_name:='Aiosell delivery failed';result:='Needs attention';else action_name:='Aiosell delivery recovered';result:='Accepted by Aiosell';end if;
  elsif after_data->'approved' is distinct from before_data->'approved' then action_name:='Online offering review changed';
  elsif after_data->'auto_sync' is distinct from before_data->'auto_sync' then action_name:='Automatic update preference changed';
  else return null; end if;
 elsif tg_table_name='stayman_billing_profiles' then
  if after_data->'settings' is not distinct from before_data->'settings' then return null; end if;
  action_name:='Billing configuration changed';
 elsif tg_table_name='stayman_staff_invitations' then
  if after_data->'status' is not distinct from before_data->'status' and after_data->'sent_at' is not distinct from before_data->'sent_at' then return null; end if;
  actor_id:=coalesce(actor_id,(after_data->>'invited_by')::uuid);action_name:='Team invitation updated';result:=after_data->>'status';
 elsif tg_table_name='stayman_units' then
  if tg_op='UPDATE' and after_data->'nightly_rate_paise' is distinct from before_data->'nightly_rate_paise' then action_name:='Unit price changed';
  elsif tg_op='INSERT' then action_name:='Bookable unit created';
  elsif after_data->'archived_at' is distinct from before_data->'archived_at' then action_name:='Bookable unit archived';
  elsif (after_data-'nightly_rate_paise') is distinct from (before_data-'nightly_rate_paise') then action_name:='Room or bed details changed';else return null;end if;
 else return null; end if;
 -- Deliberately log summaries only: no credentials, full contact details, tax settings or guest documents.
 insert into public.stayman_admin_activity(property_id,actor,action,outcome,details) values(selected_property,actor_id,action_name,coalesce(result,'Saved'),changed);
 return null;
end $$;
revoke all on function public.stayman_capture_admin_activity() from public,anon,authenticated,service_role;
drop trigger if exists admin_activity_capture on public.stayman_properties;
create trigger admin_activity_capture after insert or update or delete on public.stayman_properties for each row execute function public.stayman_capture_admin_activity();
drop trigger if exists admin_activity_capture on public.stayman_staff;
create trigger admin_activity_capture after insert or update or delete on public.stayman_staff for each row execute function public.stayman_capture_admin_activity();
drop trigger if exists admin_activity_capture on public.stayman_aiosell_connections;
create trigger admin_activity_capture after insert or update or delete on public.stayman_aiosell_connections for each row execute function public.stayman_capture_admin_activity();
drop trigger if exists admin_activity_capture on public.stayman_billing_profiles;
create trigger admin_activity_capture after insert or update or delete on public.stayman_billing_profiles for each row execute function public.stayman_capture_admin_activity();
drop trigger if exists admin_activity_capture on public.stayman_staff_invitations;
create trigger admin_activity_capture after insert or update or delete on public.stayman_staff_invitations for each row execute function public.stayman_capture_admin_activity();
drop trigger if exists admin_activity_capture on public.stayman_units;
create trigger admin_activity_capture after insert or update or delete on public.stayman_units for each row execute function public.stayman_capture_admin_activity();

create or replace function public.stayman_admin_activity_list(p_property uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'propertyId',a.property_id,'property',p.name,'actor',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'System'),'action',a.action,'outcome',a.outcome,'at',a.created_at) order by a.created_at desc) from (select * from public.stayman_admin_activity where p_property is null or property_id=p_property order by created_at desc limit 50) a left join public.stayman_properties p on p.id=a.property_id left join auth.users u on u.id=a.actor),'[]'::jsonb);
end $$;
create or replace function public.stayman_admin_console() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare properties jsonb; begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 select coalesce(jsonb_agg(p||jsonb_build_object('inventory',jsonb_build_object('beds',inv.beds,'privateRooms',inv.private_rooms,'roomsOrDorms',inv.groups,'missingPrices',inv.missing_prices),
 'billingReady',coalesce(b.settings->>'registration','UNCONFIGURED')<>'UNCONFIGURED',
 'aiosellState',case when c.property_id is null then 'Not configured' when not c.setup_verified then 'Setup incomplete' when not public.stayman_aiosell_ready(c.property_id) then 'Setup incomplete' when not c.approved then 'Owner review pending' when c.last_error is not null then 'Delivery needs attention' when c.manual_pending or c.revision>c.synced_revision then 'Update pending' when c.enabled then 'Active' else 'Paused' end,
 'attention',(jsonb_array_length(coalesce(p->'team','[]'))=0 or not exists(select 1 from jsonb_array_elements(p->'team') t where t->>'role'='OWNER') or inv.beds+inv.private_rooms=0 or inv.missing_prices>0 or coalesce(b.settings->>'registration','UNCONFIGURED')='UNCONFIGURED' or (c.property_id is not null and (not c.setup_verified or c.last_error is not null))),
 'needs',jsonb_build_object('owner',not exists(select 1 from jsonb_array_elements(p->'team') t where t->>'role'='OWNER'),'inventory',inv.beds+inv.private_rooms=0,'pricing',inv.missing_prices>0,'billing',coalesce(b.settings->>'registration','UNCONFIGURED')='UNCONFIGURED','aiosell',c.property_id is not null and (not c.setup_verified or c.last_error is not null))) order by p->>'name'),'[]') into properties
 from jsonb_array_elements(public.stayman_admin_properties()) p
 cross join lateral(select count(*) filter(where unit_type='BED') beds,count(*) filter(where unit_type='ROOM') private_rooms,count(distinct (room_name,unit_type)) groups,count(*) filter(where nightly_rate_paise<=0) missing_prices from public.stayman_units where property_id=(p->>'id')::uuid and archived_at is null) inv
 left join public.stayman_aiosell_connections c on c.property_id=(p->>'id')::uuid left join public.stayman_billing_profiles b on b.property_id=(p->>'id')::uuid;
 return jsonb_build_object('properties',properties,'propertyCount',jsonb_array_length(properties),'teamAccountCount',(select count(distinct user_id) from public.stayman_staff),'attentionCount',(select count(*) from jsonb_array_elements(properties) p where (p->>'attention')::boolean),'at',now(),'recent',public.stayman_admin_activity_list(null));
end $$;
create or replace function public.stayman_admin_access(p_property uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',s.user_id,'email',u.email,'propertyId',s.property_id,'property',p.name,'role',s.role,'lastOwner',s.role='OWNER' and (select count(*) from public.stayman_staff other where other.property_id=s.property_id and other.role='OWNER')=1,
 'accountState',case when to_jsonb(u)->>'last_sign_in_at' is not null then 'Has signed in' when i.status is not null then i.status else 'No sign-in recorded' end)) from public.stayman_staff s join auth.users u on u.id=s.user_id join public.stayman_properties p on p.id=s.property_id left join public.stayman_staff_invitations i on i.property_id=s.property_id and lower(i.email)=lower(u.email) where p_property is null or s.property_id=p_property),'[]');
end $$;
create or replace function public.stayman_admin_change_access(p_property uuid,p_user uuid,p_role text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 if p_role is not null and p_role not in ('OWNER','MANAGER') then raise exception 'Choose Owner or Manager.'; end if;
 perform 1 from public.stayman_properties where id=p_property for update;
 select role into prior from public.stayman_staff where property_id=p_property and user_id=p_user for update;
 if not found or prior is distinct from p_expected then raise exception 'Access changed. Refresh before editing.'; end if;
 if prior='OWNER' and p_role is distinct from 'OWNER' and (select count(*) from public.stayman_staff where property_id=p_property and role='OWNER')<=1 then raise exception 'Keep at least one owner assigned to this property.'; end if;
 if p_role is null then delete from public.stayman_staff where property_id=p_property and user_id=p_user;else update public.stayman_staff set role=p_role where property_id=p_property and user_id=p_user;end if;
end $$;
create or replace function public.stayman_save_rates(p_property uuid,p_rates jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; rate bigint; unit_id uuid;
begin
  if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required to change pricing.'; end if;
  if p_rates is null or jsonb_typeof(p_rates)<>'array' or jsonb_array_length(p_rates)=0 then raise exception 'Provide room rates.'; end if;
  if (select count(*) from jsonb_array_elements(p_rates))<>(select count(distinct value->>'unitId') from jsonb_array_elements(p_rates)) then
    raise exception 'Duplicate unit in rate request.';
  end if;
  for item in select value from jsonb_array_elements(p_rates) loop
    if coalesce(item->>'ratePaise','') !~ '^[0-9]+$' then raise exception 'Rate must be a whole number of paise.'; end if;
    rate:=(item->>'ratePaise')::bigint; unit_id:=(item->>'unitId')::uuid;
    if rate not between 0 and 100000000 then raise exception 'Rate is out of range.'; end if;
    update public.stayman_units set nightly_rate_paise=rate where id=unit_id and property_id=p_property;
    if not found then raise exception 'Unit not found in this property.'; end if;
  end loop;
end $$;
create or replace function public.stayman_admin_prices(p_property uuid,p_rates jsonb,p_expected jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 if jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rates)<>jsonb_array_length(p_expected) then raise exception 'Review the latest prices first.'; end if;
 perform 1 from public.stayman_units where property_id=p_property order by id for update;
 for item in select value from jsonb_array_elements(p_rates) loop
  if not exists(select 1 from public.stayman_units u join jsonb_array_elements(p_expected) e on e->>'unitId'=u.id::text where u.property_id=p_property and u.archived_at is null and u.id=(item->>'unitId')::uuid and u.nightly_rate_paise=(e->>'ratePaise')::bigint) then raise exception 'A unit or price changed. Refresh and review again.'; end if;
 end loop;
 perform public.stayman_save_rates(p_property,p_rates);
end $$;
create or replace function public.stayman_admin_invoices(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Platform administrator access required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',f.reservation_id,'number',f.invoice_number,'issuedAt',f.issued_at,'reference',r.booking_ref) order by f.issued_at desc) from public.stayman_folios f join public.stayman_reservations r on r.id=f.reservation_id where f.property_id=p_property and f.status='ISSUED'),'[]');
end $$;
create or replace function public.stayman_aiosell_extra_price(p_property uuid,p_key uuid,p_amount bigint,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; begin
 if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required.'; end if;
 if p_amount is null or p_amount not between 0 and 100000000 then raise exception 'Invalid extra-guest price.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 if c.revision is distinct from p_revision then raise exception 'Prices changed. Refresh and try again.'; end if;
 if not exists(select 1 from jsonb_array_elements(c.mappings) m where m->>'mappingId'=p_key::text and m->'guestPricing' is not null) then raise exception 'Ask your administrator to configure guest limits first.'; end if;
 update public.stayman_aiosell_connections set mappings=(select jsonb_agg(case when m->>'mappingId'=p_key::text then jsonb_set(m,'{guestPricing,extraGuestPaise}',to_jsonb(p_amount)) else m end) from jsonb_array_elements(c.mappings) m),revision=revision+1,retry_at=now(),attempts=0 where property_id=p_property;
end $$;
revoke all on function public.stayman_admin_console(),public.stayman_admin_activity_list(uuid),public.stayman_admin_access(uuid),public.stayman_admin_change_access(uuid,uuid,text,text),public.stayman_admin_prices(uuid,jsonb,jsonb),public.stayman_admin_invoices(uuid) from public,anon,authenticated,service_role;
grant execute on function public.stayman_admin_console(),public.stayman_admin_activity_list(uuid),public.stayman_admin_access(uuid),public.stayman_admin_change_access(uuid,uuid,text,text),public.stayman_admin_prices(uuid,jsonb,jsonb),public.stayman_admin_invoices(uuid) to authenticated;
-- Durable guided mapping changes. A retry never replaces the active association early.
create table if not exists public.stayman_aiosell_transitions (
 property_id uuid primary key references public.stayman_properties(id),id uuid not null default gen_random_uuid(),
 old_hotel text not null,hotel text not null,mappings jsonb not null,closure_revision bigint not null,
 was_approved boolean not null,was_enabled boolean not null,created_at timestamptz not null default now());
alter table public.stayman_aiosell_transitions enable row level security;
revoke all on public.stayman_aiosell_transitions from public,anon,authenticated;
create or replace function public.stayman_admin_mapping_change(p_property uuid,p_action text,p_revision bigint default null,p_hotel text default null,p_mappings jsonb default null,p_transition uuid default null,p_verified boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; t public.stayman_aiosell_transitions; closed_maps jsonb; prior_enabled boolean; begin
 if public.stayman_is_platform_admin() is distinct from true then raise exception 'Administrator configuration required.'; end if;
 perform 1 from public.stayman_properties where id=p_property for update;
 select * into c from public.stayman_aiosell_connections where property_id=p_property for update;
 select * into t from public.stayman_aiosell_transitions where property_id=p_property for update;
 if p_action='state' then return case when t.id is null then null else to_jsonb(t) end;end if;
 if p_action='cancel' then
  if t.id is distinct from p_transition then raise exception 'Mapping change changed. Refresh.';end if;
  delete from public.stayman_aiosell_transitions where property_id=p_property;
  return jsonb_build_object('stage','cancelled','message','Draft discarded. Existing inventory stays closed until reviewed.');
 end if;
 if p_action='begin' then
  prior_enabled:=c.enabled;
  if t.id is not null then raise exception 'Finish or discard the saved mapping change first.';end if;
  if c.revision is distinct from p_revision then raise exception 'Configuration changed. Refresh and review again.';end if;
  if c.property_id is null or jsonb_array_length(c.mappings)=0 then raise exception 'Save initial mappings using property setup.';end if;
  if jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings)>100 or coalesce(length(trim(p_hotel)),0) not between 1 and 120 then raise exception 'Invalid mapping change.';end if;
  if p_hotel<>c.hotel_code and exists(select 1 from public.stayman_aiosell_bookings where property_id=p_property) then raise exception 'Hotel code cannot change after receiving bookings. Resolve linked booking dependencies with your administrator; no bookings were detached.';end if;
  -- Remember preferences even if all categories were already intentionally closed.
  update public.stayman_aiosell_connections set resume_preferences=coalesce(resume_preferences,(select jsonb_object_agg(id,not (m->>'stopSell')::boolean) from jsonb_array_elements(c.mappings) m,lateral jsonb_array_elements_text(m->'unitIds') id)) where property_id=p_property;
  select jsonb_agg(m||jsonb_build_object('stopSell',true)) into closed_maps from jsonb_array_elements(c.mappings) m;
  perform public.stayman_aiosell_save_validated(p_property,c.hotel_code,true,closed_maps);
  update public.stayman_aiosell_connections set manual_pending=true,pending_scope='SALES',retry_at=now() where property_id=p_property returning * into c;
  insert into public.stayman_aiosell_transitions(property_id,old_hotel,hotel,mappings,closure_revision,was_approved,was_enabled)
   values(p_property,c.hotel_code,trim(p_hotel),p_mappings,c.revision,c.approved,prior_enabled) returning * into t;
  return to_jsonb(t);
 end if;
 if p_action<>'apply' or t.id is null or t.id is distinct from p_transition then raise exception 'Mapping change not found. Refresh.';end if;
 if not p_verified then raise exception 'Verify zero availability for the old categories in Aiosell first.';end if;
 if c.revision<>t.closure_revision or c.hotel_code<>t.old_hotel then raise exception 'Sales settings changed during closure. Discard the draft and review again.';end if;
 if exists(select 1 from jsonb_array_elements(c.mappings) m where (m->>'stopSell')::boolean is distinct from true)
  or not coalesce((c.last_sync_results->>'revision')::bigint=c.revision and c.last_sync_results->'stages'->'inventory'->>'status'='sent',false)
 then raise exception 'Old inventory closure has not been accepted by Aiosell. Retry closure; saved mappings are unchanged.';end if;
 -- Pause through the existing dependency guard; this transaction rolls back on any validation failure.
 perform public.stayman_aiosell_save_validated(p_property,c.hotel_code,false,c.mappings);
 select * into c from public.stayman_aiosell_connections where property_id=p_property;
 perform public.stayman_aiosell_configure(p_property,t.hotel,false,t.mappings,c.revision);
 if t.was_approved and t.was_enabled and t.hotel=t.old_hotel and public.stayman_aiosell_ready(p_property) then
  update public.stayman_aiosell_connections set approved=true,enabled=true,resume_preferences=null,manual_pending=true,pending_scope='FULL',retry_at=now(),attempts=0 where property_id=p_property;
 end if;
 delete from public.stayman_aiosell_transitions where property_id=p_property;
 insert into public.stayman_admin_activity(property_id,actor,action) values(p_property,auth.uid(),'Guided online mapping change saved');
 return jsonb_build_object('stage','saved','restart',t.was_approved and t.was_enabled and t.hotel=t.old_hotel and public.stayman_aiosell_ready(p_property));
end $$;
revoke all on function public.stayman_admin_mapping_change(uuid,text,bigint,text,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.stayman_admin_mapping_change(uuid,text,bigint,text,jsonb,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
