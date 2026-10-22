begin;
-- Secrets live in Edge Function secrets, never in these property records.
create table if not exists public.stayman_aiosell_connections (
 property_id uuid primary key references public.stayman_properties(id),
 hotel_code text not null unique check(length(hotel_code) between 1 and 120),
 enabled boolean not null default false,
 mappings jsonb not null default '[]',
 revision bigint not null default 1, synced_revision bigint not null default 0,
 lease uuid, lease_until timestamptz, attempts integer not null default 0,
 retry_at timestamptz not null default now(), last_synced_at timestamptz, last_error text,
 updated_at timestamptz not null default now()
);
create table if not exists public.stayman_aiosell_events (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
 channel text not null, booking_id text not null, fingerprint text not null,
 action text not null check(action in ('book','modify','cancel')), payload jsonb not null,
 status text not null default 'RECEIVED' check(status in ('RECEIVED','APPLIED','REVIEW')),
 issue text, received_at timestamptz not null default now(),
 unique(property_id,channel,booking_id,fingerprint)
);
create table if not exists public.stayman_aiosell_bookings (
 property_id uuid not null references public.stayman_properties(id), channel text not null, booking_id text not null,
 reservation_id uuid references public.stayman_reservations(id), cancelled boolean not null default false,
 primary key(property_id,channel,booking_id)
);
create index if not exists stayman_aiosell_events_recent on public.stayman_aiosell_events(property_id,received_at desc);
create index if not exists stayman_aiosell_events_review on public.stayman_aiosell_events(property_id) where status='REVIEW';
alter table public.stayman_aiosell_connections enable row level security;
alter table public.stayman_aiosell_events enable row level security;
alter table public.stayman_aiosell_bookings enable row level security;
revoke all on public.stayman_aiosell_connections,public.stayman_aiosell_events,public.stayman_aiosell_bookings from anon,authenticated;
grant all on public.stayman_aiosell_connections,public.stayman_aiosell_events,public.stayman_aiosell_bookings to service_role;
-- OTAs may withhold contact data. Existing manual booking validation remains unchanged.
alter table public.stayman_guests alter column phone drop not null;
alter table public.stayman_guests add column if not exists ota_contact_withheld boolean not null default false;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='stayman_guest_contact_required' and conrelid='public.stayman_guests'::regclass) then
 alter table public.stayman_guests add constraint stayman_guest_contact_required check(phone is not null or ota_contact_withheld);
 end if;
end $$;

create or replace function public.stayman_aiosell_settings(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 return jsonb_build_object('connection',(select to_jsonb(c)-'lease'-'lease_until' from public.stayman_aiosell_connections c where property_id=p_property),
 'reviewCount',(select count(*) from public.stayman_aiosell_events where property_id=p_property and status='REVIEW'),
 'events',coalesce((select jsonb_agg(x) from (select e.id,e.channel,e.booking_id,e.action,e.status,e.issue,e.received_at,
 case when e.status='REVIEW' then e.payload else null end as payload,b.reservation_id
 from public.stayman_aiosell_events e left join public.stayman_aiosell_bookings b using(property_id,channel,booking_id)
 where e.property_id=p_property order by (e.status='REVIEW') desc,e.received_at desc limit 30) x),'[]'::jsonb));
end $$;

create or replace function public.stayman_aiosell_save(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; ids uuid[]; used uuid[]:='{}'; code text; codes text[]:='{}'; prior public.stayman_aiosell_connections;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 select * into prior from public.stayman_aiosell_connections where property_id=p_property for update;
 if prior.enabled and (not p_enabled or prior.hotel_code<>trim(p_hotel)) and
 (prior.synced_revision<prior.revision or prior.last_error is not null or exists(select 1 from jsonb_array_elements(prior.mappings) x where not (x->>'stopSell')::boolean))
 then raise exception 'Stop sell on every mapped room and sync successfully before pausing or changing hotel.'; end if;
 if prior.enabled and exists(select 1 from jsonb_array_elements(prior.mappings) old where not exists(select 1 from jsonb_array_elements(p_mappings) fresh where fresh->>'roomCode'=old->>'roomCode'))
 then raise exception 'Pause a fully stop-sold connection before removing a room mapping.'; end if;
 if coalesce(length(trim(p_hotel)),0) not between 1 and 120 or jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings)>100 then raise exception 'Invalid connection settings.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  code:=m->>'roomCode';
  if coalesce(length(code),0) not between 1 and 120 or code=any(codes) then raise exception 'Each room code must be unique.'; end if;
  codes:=array_append(codes,code);
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(m->'unitIds');
  if coalesce(cardinality(ids),0)=0 or ids && used or cardinality(ids)<>(select count(distinct v) from unnest(ids) v)
    or exists(select 1 from unnest(ids) v where not exists(select 1 from public.stayman_units u where u.id=v and u.property_id=p_property and u.archived_at is null)) then raise exception 'Choose distinct active units from this property.'; end if;
  if (select count(distinct (u.unit_type,u.gender_policy)) from public.stayman_units u where u.id=any(ids))<>1 then raise exception 'A room mapping cannot mix beds, rooms or gender policies.'; end if;
  used:=used||ids;
  if coalesce(length(m->>'rateplanCode'),0) not between 1 and 120 or coalesce(m->>'ratePaise','') !~ '^[0-9]{1,10}$'
    or coalesce(m->>'minimumStay','') !~ '^[1-9][0-9]{0,2}$' or jsonb_typeof(m->'stopSell') is distinct from 'boolean' then raise exception 'Set a valid rate plan, price and restrictions.'; end if;
 end loop;
 if p_enabled and jsonb_array_length(p_mappings)=0 then raise exception 'Map inventory before enabling sync.'; end if;
 if exists(select 1 from public.stayman_aiosell_connections where property_id=p_property and hotel_code<>trim(p_hotel))
 and exists(select 1 from public.stayman_aiosell_bookings where property_id=p_property) then raise exception 'Hotel code cannot change after receiving bookings.'; end if;
 insert into public.stayman_aiosell_connections(property_id,hotel_code,enabled,mappings) values(p_property,trim(p_hotel),p_enabled,p_mappings)
 on conflict(property_id) do update set hotel_code=excluded.hotel_code,enabled=excluded.enabled,mappings=excluded.mappings,
 revision=stayman_aiosell_connections.revision+1,retry_at=now(),attempts=0,updated_at=now();
end $$;

create or replace function public.stayman_aiosell_inventory_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=old.property_id and enabled; end if;
 if tg_op<>'DELETE' then update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=new.property_id and enabled; end if;
 return null;
end $$;
create or replace trigger aiosell_allocation_change after insert or update or delete on public.stayman_allocations for each row execute function public.stayman_aiosell_inventory_changed();
create or replace trigger aiosell_unit_change after insert or update or delete on public.stayman_units for each row execute function public.stayman_aiosell_inventory_changed();

-- A leased, coalesced property snapshot avoids one network call per changed row.
create or replace function public.stayman_aiosell_claim(p_property uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; token uuid:=gen_random_uuid(); start_day date; inventory jsonb; blocked boolean;
begin
 select * into c from public.stayman_aiosell_connections where enabled and (p_property is null or property_id=p_property)
 and (revision>synced_revision or last_synced_at is null or last_synced_at<now()-interval '12 hours')
 and retry_at<=now() and (lease_until is null or lease_until<now()) order by retry_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.stayman_aiosell_connections set lease=token,lease_until=now()+interval '2 minutes' where property_id=c.property_id;
 select (now() at time zone coalesce(timezone,'Asia/Kolkata'))::date into start_day from public.stayman_properties where id=c.property_id;
 select exists(select 1 from public.stayman_aiosell_events where property_id=c.property_id and status='REVIEW') into blocked;
 select jsonb_agg(jsonb_build_object('startDate',d::date,'endDate',d::date,'rooms',
  (select jsonb_agg(jsonb_build_object('roomCode',m->>'roomCode','available',case when blocked or (m->>'stopSell')::boolean then 0 else
    (select count(*) from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null
     and u.id in (select value::uuid from jsonb_array_elements_text(m->'unitIds'))
     and not exists(select 1 from public.stayman_allocations a where a.unit_id=u.id and a.check_in_date<=d::date and a.check_out_date>d::date)) end))
   from jsonb_array_elements(c.mappings) m))) into inventory
 from generate_series(start_day::timestamp,(start_day+89)::timestamp,interval '1 day') d;
 return jsonb_build_object('property',c.property_id,'hotelCode',c.hotel_code,'lease',token,'revision',c.revision,'startDate',start_day,'endDate',start_day+89,'mappings',c.mappings,'updates',inventory,'blocked',blocked);
end $$;
create or replace function public.stayman_aiosell_finish(p_property uuid,p_lease uuid,p_revision bigint,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.stayman_aiosell_connections set lease=null,lease_until=null,
 synced_revision=case when p_error is null then p_revision else synced_revision end,
 last_synced_at=case when p_error is null then now() else last_synced_at end,
 last_error=left(p_error,200),attempts=case when p_error is null then 0 else attempts+1 end,
 retry_at=case when p_error is null then now() else now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) end
 where property_id=p_property and lease=p_lease;
end $$;

-- Persist before applying; a conflict rolls back only the attempted reservation change.
create or replace function public.stayman_aiosell_receive(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; e uuid; r public.stayman_reservations; room_index integer:=0;
 b public.stayman_aiosell_bookings; room jsonb; mapping jsonb; u uuid; g uuid; rid uuid; arrive date; depart date; failure_message text;
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
   insert into public.stayman_guests(property_id,full_name,phone,email,gender,ota_contact_withheld) values(c.property_id,p_payload->'guest'->>'name',p_payload->'guest'->>'phone',p_payload->'guest'->>'email','OTHER',p_payload->'guest'->>'phone' is null) returning id into g;
   insert into public.stayman_reservations(property_id,guest_id,booking_ref,check_in_date,check_out_date,total_amount,source,notes)
   values(c.property_id,g,'OTA-'||gen_random_uuid(),arrive,depart,(p_payload->>'totalPaise')::bigint,p_payload->>'channel',coalesce(p_payload->>'specialRequests','')) returning id into rid;
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

create or replace function public.stayman_aiosell_resolve(p_event uuid,p_reservation text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.stayman_aiosell_events; r public.stayman_reservations;
begin
 select * into e from public.stayman_aiosell_events where id=p_event;
 if not found or not public.stayman_is_owner(e.property_id) then raise exception 'Owner access required.'; end if;
 perform 1 from public.stayman_aiosell_connections where property_id=e.property_id for update;
 if e.status<>'REVIEW' then raise exception 'Event no longer needs review.'; end if;
 if exists(select 1 from public.stayman_aiosell_events newer where newer.property_id=e.property_id and newer.channel=e.channel and newer.booking_id=e.booking_id
   and newer.status='REVIEW' and (newer.received_at,newer.id)>(e.received_at,e.id)) then raise exception 'Resolve the most recently received review for this OTA booking after verifying its latest state in Aiosell.'; end if;
 select * into r from public.stayman_reservations where (id::text=p_reservation or booking_ref=p_reservation) and property_id=e.property_id for update;
 if not found then raise exception 'Choose the local reservation after reconciling the OTA booking.'; end if;
 if exists(select 1 from public.stayman_aiosell_bookings where property_id=e.property_id and channel=e.channel and booking_id=e.booking_id and reservation_id is not null and reservation_id<>r.id)
 then raise exception 'This OTA booking is already linked to a different reservation.'; end if;
 if e.action='cancel' then
  if r.status<>'CANCELLED' or exists(select 1 from public.stayman_allocations where reservation_id=r.id) then raise exception 'Cancel the local reservation and release inventory first.'; end if;
 else
  if r.status='CANCELLED' or r.check_in_date<>(e.payload->>'checkin')::date or r.check_out_date<>(e.payload->>'checkout')::date
    or r.total_amount<>(e.payload->>'totalPaise')::bigint then raise exception 'Reconcile the local dates and total with this OTA event first.'; end if;
  if exists(
   select 1 from (select x->>'roomCode' code,count(*) required from jsonb_array_elements(e.payload->'rooms') x group by x->>'roomCode') requested
   cross join generate_series(r.check_in_date::timestamp,(r.check_out_date-1)::timestamp,interval '1 day') d
   where (select count(*) from public.stayman_allocations a
    where a.reservation_id=r.id and a.check_in_date<=d::date and a.check_out_date>d::date
    and a.unit_id in (select v::uuid from public.stayman_aiosell_connections c,
      lateral jsonb_array_elements(c.mappings) m,lateral jsonb_array_elements_text(m->'unitIds') v
      where c.property_id=e.property_id and m->>'roomCode'=requested.code))<requested.required
  ) then raise exception 'Allocate every required mapped unit for every night before resolving this booking.'; end if;
 end if;
 insert into public.stayman_aiosell_bookings(property_id,channel,booking_id,reservation_id,cancelled) values(e.property_id,e.channel,e.booking_id,r.id,e.action='cancel')
 on conflict(property_id,channel,booking_id) do update set reservation_id=r.id,cancelled=e.action='cancel';
 update public.stayman_aiosell_events set status='APPLIED',issue=case when id=e.id then 'Reconciled manually by property owner.' else 'Superseded by owner reconciliation of the latest received review.' end
 where property_id=e.property_id and channel=e.channel and booking_id=e.booking_id and status='REVIEW';
 update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=e.property_id;
end $$;

-- Only a service backend may claim jobs or accept authenticated OTA deliveries.
revoke all on function public.stayman_aiosell_settings(uuid),public.stayman_aiosell_save(uuid,text,boolean,jsonb),public.stayman_aiosell_inventory_changed(),public.stayman_aiosell_claim(uuid),public.stayman_aiosell_finish(uuid,uuid,bigint,text),public.stayman_aiosell_receive(jsonb) from public,anon,authenticated;
grant execute on function public.stayman_aiosell_settings(uuid),public.stayman_aiosell_save(uuid,text,boolean,jsonb) to authenticated;
revoke all on function public.stayman_aiosell_resolve(uuid,text) from public,anon,authenticated;
grant execute on function public.stayman_aiosell_resolve(uuid,text) to authenticated;
grant execute on function public.stayman_aiosell_claim(uuid),public.stayman_aiosell_finish(uuid,uuid,bigint,text),public.stayman_aiosell_receive(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
