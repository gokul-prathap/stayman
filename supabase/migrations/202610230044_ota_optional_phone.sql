-- Inbound OTA contact details must not block confirmed inventory.
begin;
create or replace function public.stayman_validate_phone_length() returns trigger
language plpgsql security definer set search_path='' as $$
declare value text;
begin
 if tg_table_name='stayman_guests' then
  if new.phone is null and new.ota_contact_withheld then return new; end if;
  value:=new.phone;
 else
  if new.status<>'completed' or new.details is null then return new; end if;
  value:=new.details->>'phone';
 end if;
 if not public.stayman_phone_length_valid(value) then raise exception 'Phone number length does not match its country code.'; end if;
 return new;
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
    select value into mapping from jsonb_array_elements(c.mappings) where value->>'roomCode'=room->>'roomCode' and value->>'rateplanCode'=room->>'rateplanCode';
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
revoke all on function public.stayman_aiosell_receive(jsonb) from public,anon,authenticated;
grant execute on function public.stayman_aiosell_receive(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
