-- After 044. One inventory category, multiple rate plans; legacy mappings remain valid.
begin;
create or replace function public.stayman_aiosell_save(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; plan jsonb; plans jsonb; cleaned jsonb:='[]'; seen text[]; prior public.stayman_aiosell_connections;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
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
   if coalesce(plan->>'rateSource','pricing') not in ('pricing','fixed') then raise exception 'Invalid rate source.'; end if;
   if plan->>'rateSource'='fixed' and (coalesce(plan->>'ratePaise','') !~ '^[0-9]{1,10}$' or (plan->>'ratePaise')::bigint not between 1 and 100000000) then raise exception 'Set a positive rate-plan price in Pricing.'; end if;
  end loop;
  cleaned:=cleaned||jsonb_build_array((m-'ratePaise')||jsonb_build_object('rateplanCode',plans->0->>'rateplanCode','ratePlans',plans,'ratePaise',0,'rateSource','pricing'));
 end loop;
 perform public.stayman_aiosell_save_config(p_property,p_hotel,p_enabled,cleaned);
end $$;

create or replace function public.stayman_aiosell_resolved_rates(p_property uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((m-'ratePaise')||jsonb_build_object('ratePaise',case when n=expected and variants=1 and price>0 then price else null end,
  'priceError',case when n<>expected or n=0 then 'Mapped units are missing or archived.' when variants<>1 then 'Mapped units have different prices.' when price<=0 then 'Set a positive price in Pricing.' else null end,
  'ratePlans',(select jsonb_agg(plan||jsonb_build_object('ratePaise',case when plan->>'rateSource'='fixed' then (plan->>'ratePaise')::bigint when n=expected and variants=1 and price>0 then price else null end))
   from jsonb_array_elements(coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')))) plan)) order by position),'[]'::jsonb)
 from public.stayman_aiosell_connections c cross join lateral jsonb_array_elements(c.mappings) with ordinality entries(m,position)
 cross join lateral(select count(*) n,count(distinct nightly_rate_paise) variants,min(nightly_rate_paise) price from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))) prices
 cross join lateral(select jsonb_array_length(m->'unitIds') expected) size where c.property_id=p_property;
$$;

-- Pricing edits are checked against the current configuration revision, never a stale UI snapshot.
create or replace function public.stayman_aiosell_plan_prices(p_property uuid,p_revision bigint,p_prices jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; entry jsonb; maps jsonb; seen text[]:='{}'; key text;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
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
 perform public.stayman_aiosell_save(p_property,c.hotel_code,c.enabled,maps);
end $$;

-- Serialize new UI saves and reject stale edits from another tab.
create or replace function public.stayman_aiosell_configure(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 -- Property lock also serializes first-time setup with no connection row yet.
 perform 1 from public.stayman_properties where id=p_property for update;
 select revision into current_revision from public.stayman_aiosell_connections where property_id=p_property for update;
 if current_revision is distinct from p_revision then raise exception 'Configuration changed. Refresh status and review your matches again.'; end if;
 perform public.stayman_aiosell_save(p_property,p_hotel,p_enabled,p_mappings);
end $$;
revoke all on function public.stayman_aiosell_configure(uuid,text,boolean,jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.stayman_aiosell_configure(uuid,text,boolean,jsonb,bigint) to authenticated;

-- Include a revision for optimistic pricing edits, preserving the existing status contract.
do $$ begin
 if to_regprocedure('public.stayman_aiosell_pricing_status_base(uuid)') is null then alter function public.stayman_aiosell_pricing_status(uuid) rename to stayman_aiosell_pricing_status_base; end if;
end $$;
revoke all on function public.stayman_aiosell_pricing_status_base(uuid) from public,anon,authenticated,service_role;
create or replace function public.stayman_aiosell_pricing_status(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 return public.stayman_aiosell_pricing_status_base(p_property)||jsonb_build_object('revision',(select revision from public.stayman_aiosell_connections where property_id=p_property));
end $$;
create or replace function public.stayman_aiosell_receive(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; e uuid; r public.stayman_reservations; room_index integer:=0;
 b public.stayman_aiosell_bookings; room jsonb; mapping jsonb; u uuid; g uuid; rid uuid; arrive date; depart date; failure_message text; contact_phone text;
begin
 select * into c from public.stayman_aiosell_connections where hotel_code=p_payload->>'hotelCode' and enabled for update;
 if not found then raise exception 'Unknown or disabled property.'; end if;
 insert into public.stayman_aiosell_events(property_id,channel,booking_id,fingerprint,action,payload)
 values(c.property_id,p_payload->>'channel',p_payload->>'bookingId',md5(p_payload::text),p_payload->>'action',p_payload)
 on conflict do nothing returning id into e;
 if e is null then return jsonb_build_object('success',true,'message','Duplicate delivery already received.'); end if;
 select * into b from public.stayman_aiosell_bookings where property_id=c.property_id and channel=p_payload->>'channel' and booking_id=p_payload->>'bookingId';
 begin
  if p_payload->>'action'='cancel' then
   if b.reservation_id is not null then
    select * into r from public.stayman_reservations where id=b.reservation_id for update;
    if r.status not in ('PENDING','CANCELLED') or r.paid_amount>0 then raise exception 'Cancellation requires staff review of stay/payment status.'; end if;
    update public.stayman_reservations set status='CANCELLED',cancelled_at=now(),cancellation_reason='Cancelled by OTA' where id=r.id;
    delete from public.stayman_allocations where reservation_id=r.id;
   end if;
   insert into public.stayman_aiosell_bookings(property_id,channel,booking_id,cancelled) values(c.property_id,p_payload->>'channel',p_payload->>'bookingId',true)
   on conflict(property_id,channel,booking_id) do update set cancelled=true;
  else
   if b.cancelled then raise exception 'Booking was already cancelled; review event ordering.'; end if;
   if p_payload->>'action'='book' and b.reservation_id is not null then raise exception 'Booking already exists with different details.'; end if;
   -- No modification version/timestamp is documented. Do not silently apply potentially stale changes.
   if p_payload->>'action'='modify' then raise exception 'OTA modification requires staff review; verify latest booking state in Aiosell.'; end if;
   arrive:=(p_payload->>'checkin')::date; depart:=(p_payload->>'checkout')::date;
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
  end if;
  update public.stayman_aiosell_events set status='APPLIED' where id=e;
 exception when others then
  get stacked diagnostics failure_message=message_text;
  update public.stayman_aiosell_events set status='REVIEW',issue=case when sqlstate in ('P0001') then left(failure_message,200) else 'Booking could not be applied. Review the OTA booking and local allocation.' end where id=e;
 end;
 update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=c.property_id;
 return jsonb_build_object('success',true,'message','Reservation received durably.');
end $$;
revoke all on function public.stayman_aiosell_save(uuid,text,boolean,jsonb),public.stayman_aiosell_plan_prices(uuid,bigint,jsonb),public.stayman_aiosell_resolved_rates(uuid),public.stayman_aiosell_pricing_status(uuid),public.stayman_aiosell_receive(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.stayman_aiosell_save(uuid,text,boolean,jsonb),public.stayman_aiosell_plan_prices(uuid,bigint,jsonb),public.stayman_aiosell_pricing_status(uuid) to authenticated;
grant execute on function public.stayman_aiosell_receive(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
