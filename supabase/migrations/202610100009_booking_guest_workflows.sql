-- Apply once AFTER migrations 001–008. Staff-only group links and reservation edits.
begin;
create table public.stayman_booking_members (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 reservation_id uuid not null,
 display_name text not null check(length(trim(display_name)) between 2 and 100),
 invitation_id uuid not null unique references public.guest_checkin_invitations(id),
 created_at timestamptz not null default now(),
 foreign key(reservation_id,property_id) references public.stayman_reservations(id,property_id)
);
create index on public.stayman_booking_members(reservation_id);
alter table public.stayman_booking_members enable row level security;
revoke all on public.stayman_booking_members from public,anon,authenticated;
grant select on public.stayman_booking_members to authenticated;
create policy staff_booking_members on public.stayman_booking_members for select to authenticated
 using(public.stayman_is_staff(property_id));

-- Metadata/details are available to authorized staff. Image bytes are fetched separately on demand.
create function public.stayman_member_details(p_property uuid)
returns table(id uuid,reservation_id uuid,display_name text,invitation_id uuid,status text,details jsonb,completed_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 return query select m.id,m.reservation_id,m.display_name,i.id,i.status,i.details,i.completed_at
 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
 where m.property_id=p_property order by m.created_at;
end $$;
create function public.stayman_add_member(p_reservation uuid,p_name text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; token text; iid uuid; existing public.stayman_booking_members;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status not in ('PENDING','CHECKED_IN') or r.check_out_date<=(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date then raise exception 'Booking is not open for web check-in.'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 or p_request is null then raise exception 'Enter a guest name.'; end if;
 select * into existing from public.stayman_booking_members where id=p_request;
 if found then
  if existing.reservation_id<>r.id or existing.display_name<>trim(p_name) then raise exception 'Request ID already used.'; end if;
  raise exception 'Guest link already created. Use Generate new link to replace it.';
 end if;
 if (select count(*) from public.stayman_booking_members where reservation_id=r.id)>=50 then raise exception 'Maximum 50 guests per booking.'; end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.guest_checkin_invitations(token_hash,email,expires_at)
 values(encode(sha256(convert_to(token,'UTF8')),'hex'),'pending@stayman.invalid',
 (r.check_out_date::timestamp at time zone (select timezone from public.stayman_properties where id=r.property_id))) returning id into iid;
 insert into public.stayman_booking_members(id,property_id,reservation_id,display_name,invitation_id)
 values(p_request,r.property_id,r.id,trim(p_name),iid);
 return jsonb_build_object('token',token,'id',p_request);
end $$;
create function public.stayman_reissue_member(p_member uuid)
returns text language plpgsql security definer set search_path='' as $$
declare m public.stayman_booking_members; r public.stayman_reservations; token text;
begin
 select reservation_id into r.id from public.stayman_booking_members where id=p_member;
 select * into r from public.stayman_reservations where id=r.id for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select * into m from public.stayman_booking_members where id=p_member for update;
 if r.status not in ('PENDING','CHECKED_IN') or r.check_out_date<=(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date then raise exception 'Booking is not open.'; end if;
 if exists(select 1 from public.guest_checkin_invitations where id=m.invitation_id and status='completed') then raise exception 'Guest already submitted.'; end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 update public.guest_checkin_invitations set token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),
 expires_at=(r.check_out_date::timestamp at time zone (select timezone from public.stayman_properties where id=r.property_id)),user_id=null where id=m.invitation_id;
 return token;
end $$;

-- Extend the existing validation/upload completion function, keeping all existing checks.
alter function public.complete_guest_checkin(uuid,jsonb) rename to complete_guest_checkin_validated;
revoke all on function public.complete_guest_checkin_validated(uuid,jsonb) from public,anon,authenticated;
create or replace function public.complete_guest_checkin_validated(invitation_id uuid, guest_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_checkin_invitations;
begin
  select * into invitation from public.guest_checkin_invitations
    where id = invitation_id and user_id = auth.uid() for update;
  if not found then raise exception 'Invitation not found.'; end if;
  if invitation.status = 'completed' then
    return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation expired. Contact reception.'; end if;
  if guest_details is null or jsonb_typeof(guest_details) <> 'object'
    or coalesce(length(trim(guest_details->>'full_name')), 0) not between 1 and 100
    or coalesce(length(guest_details->>'email'), 0) not between 3 and 254
    or coalesce(guest_details->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or coalesce(guest_details->>'phone', '') !~ '^[+0-9() .-]{7,25}$'
    or coalesce(length(trim(guest_details->>'coming_from')), 0) not between 1 and 150
    or coalesce(length(trim(guest_details->>'going_to')), 0) not between 1 and 150
    or coalesce(guest_details->>'arrival_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(guest_details->>'departure_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(jsonb_typeof(guest_details->'foreign_guest'), '') <> 'boolean'
    or octet_length(guest_details::text) > 4096 then
    raise exception 'Please provide valid guest details.';
  end if;
  if (guest_details->>'arrival_date')::date < (now() at time zone 'Asia/Kolkata')::date
    and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=invitation.id) then
    raise exception 'Arrival cannot be before today.';
  end if;
  if regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') !~ '^([6-9][0-9]{9}|[+][1-9][0-9]{6,14})$'
    or (regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') like '+91%'
      and regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') !~ '^[+]91[6-9][0-9]{9}$') then
    raise exception 'Please enter a valid Indian or international phone number.';
  end if;
  if length(trim(guest_details->>'full_name')) < 2
    or length(trim(guest_details->>'coming_from')) < 2
    or length(trim(guest_details->>'going_to')) < 2 then
    raise exception 'Name and travel locations must contain at least 2 characters.';
  end if;
  if (guest_details->>'departure_date')::date <= (guest_details->>'arrival_date')::date then
    raise exception 'Departure must be later than arrival.';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'guest-identities'
      and name in (invitation.id::text || '/front.jpg', invitation.id::text || '/back.jpg')) <> 2 then
    raise exception 'Both identity photos must be uploaded.';
  end if;
  update public.guest_checkin_invitations set details = guest_details, email = lower(trim(guest_details->>'email')),
    status = 'completed', completed_at = now() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
end;
$$;

create function public.complete_guest_checkin(invitation_id uuid,guest_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; result jsonb;
begin
 select r0.* into r from public.stayman_booking_members m join public.stayman_reservations r0 on r0.id=m.reservation_id
 where m.invitation_id=complete_guest_checkin.invitation_id for update of r0;
 if found then
  if r.status not in ('PENDING','CHECKED_IN') then raise exception 'Reservation is no longer open. Contact the manager.'; end if;
  if (guest_details->>'arrival_date')::date<>r.check_in_date or (guest_details->>'departure_date')::date<>r.check_out_date then
   raise exception 'Stay dates must match the booking. Contact the manager for changes.';
  end if;
 end if;
 result:=public.complete_guest_checkin_validated(invitation_id,guest_details);
 return result;
end $$;

-- Use the existing token claim logic; do not expose other group members to guests.
alter function public.claim_guest_checkin(text) rename to claim_guest_checkin_validated;
revoke all on function public.claim_guest_checkin_validated(text) from public,anon,authenticated;
create function public.claim_guest_checkin(invitation_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; r public.stayman_reservations; name text;
begin
 result:=public.claim_guest_checkin_validated(invitation_token);
 if result->>'status'='completed' then return result; end if;
 select r0.* into r from public.stayman_booking_members m
 join public.stayman_reservations r0 on r0.id=m.reservation_id where m.invitation_id=(result->>'id')::uuid;
 if found then
  if r.status not in ('PENDING','CHECKED_IN') then raise exception 'Reservation is no longer open. Contact the manager.'; end if;
  select m.display_name into name from public.stayman_booking_members m where m.invitation_id=(result->>'id')::uuid;
  result:=result||jsonb_build_object('full_name',name,'arrival_date',r.check_in_date,'departure_date',r.check_out_date,'linked',true,'email','');
 end if;
 return result;
end $$;

-- Storage remains private. Policy permits signed URLs only for property staff and completed linked documents.
create policy staff_linked_identity_read on storage.objects for select to authenticated
 using(bucket_id='guest-identities' and exists(
 select 1 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
 where public.stayman_is_staff(m.property_id) and i.status='completed'
 and name in (i.id::text||'/front.jpg',i.id::text||'/back.jpg')));
-- Enable the policy subquery without exposing invitations from other properties.
create policy staff_linked_invitation_read on public.guest_checkin_invitations for select to authenticated
 using(exists(select 1 from public.stayman_booking_members m
 where m.invitation_id=guest_checkin_invitations.id and public.stayman_is_staff(m.property_id)));

create table public.stayman_reservation_edits (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
 reservation_id uuid not null references public.stayman_reservations(id),
 before_details jsonb not null,after_details jsonb not null,recorded_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.stayman_reservation_edits enable row level security;
revoke all on public.stayman_reservation_edits from public,anon,authenticated;
grant select on public.stayman_reservation_edits to authenticated;
create policy staff_edits on public.stayman_reservation_edits for select to authenticated using(public.stayman_is_staff(property_id));
create function public.stayman_edit_reservation(p_reservation uuid,p_details jsonb,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; g public.stayman_guests; a public.stayman_allocations; unit public.stayman_units;
 arrive date; depart date; snapshot jsonb; new_total bigint; dates_changed boolean;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status not in ('PENDING','CHECKED_IN') then raise exception 'Only active reservations can be edited.'; end if;
 select * into g from public.stayman_guests where id=r.guest_id for update;
 snapshot:=jsonb_build_object('name',g.full_name,'phone',g.phone,'email',coalesce(g.email,''),'arrival',r.check_in_date,'departure',r.check_out_date,'notes',r.notes,'total',r.total_amount);
 if snapshot is distinct from p_expected then raise exception 'Reservation changed. Close details, refresh and retry.'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object'
 or coalesce(length(trim(p_details->>'name')),0) not between 2 and 100
 or coalesce(p_details->>'phone','') !~ '^[+]?[0-9() .-]{7,25}$'
 or (coalesce(p_details->>'email','')<>'' and (length(p_details->>'email')>254 or p_details->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
 or length(coalesce(p_details->>'notes',''))>1000 then raise exception 'Please enter valid guest details.'; end if;
 arrive:=(p_details->>'arrival')::date; depart:=(p_details->>'departure')::date;
 if arrive is null or depart is null or depart<=arrive then raise exception 'Invalid stay dates.'; end if;
 dates_changed:=arrive<>r.check_in_date or depart<>r.check_out_date;
 new_total:=r.total_amount;
 if dates_changed then
  if r.status='CHECKED_IN' and arrive<>r.check_in_date then raise exception 'Arrival cannot be changed after check-in.'; end if;
  if depart<=(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date then raise exception 'Departure must be after today.'; end if;
  if r.status='PENDING' and arrive<(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date then raise exception 'Arrival cannot be in the past.'; end if;
  if (select count(*) from public.stayman_allocations where reservation_id=r.id)<>1 then raise exception 'This stay has split bed assignments. Adjust nights with Move bed / room before editing dates.'; end if;
  select * into a from public.stayman_allocations where reservation_id=r.id for update;
  select * into unit from public.stayman_units where id=a.unit_id for share;
  new_total:=unit.nightly_rate_paise*(depart-arrive);
  update public.stayman_allocations set check_in_date=arrive,check_out_date=depart,charge_paise=new_total where id=a.id;
 end if;
 if (p_details->>'total')::bigint is distinct from new_total then raise exception 'Room rates changed. Refresh and review the price again.'; end if;
 -- Clone the booking contact if a legacy guest record is shared by several reservations.
 if exists(select 1 from public.stayman_reservations where guest_id=g.id and id<>r.id) then
  insert into public.stayman_guests(property_id,full_name,phone,email,nationality,gender)
  values(g.property_id,trim(p_details->>'name'),trim(p_details->>'phone'),nullif(trim(p_details->>'email'),''),g.nationality,g.gender) returning * into g;
 else
  update public.stayman_guests set full_name=trim(p_details->>'name'),phone=trim(p_details->>'phone'),email=nullif(trim(p_details->>'email'),'') where id=g.id;
 end if;
 update public.stayman_reservations set guest_id=g.id,check_in_date=arrive,check_out_date=depart,total_amount=new_total,notes=coalesce(p_details->>'notes','') where id=r.id;
 if dates_changed then
  update public.guest_checkin_invitations i set expires_at=(depart::timestamp at time zone (select timezone from public.stayman_properties where id=r.property_id))
  from public.stayman_booking_members m where m.reservation_id=r.id and m.invitation_id=i.id and i.status='draft';
 end if;
 insert into public.stayman_reservation_edits(property_id,reservation_id,before_details,after_details,recorded_by)
 values(r.property_id,r.id,snapshot,p_details,auth.uid());
end $$;
revoke all on function public.stayman_member_details(uuid),public.stayman_add_member(uuid,text,uuid),public.stayman_reissue_member(uuid),
 public.stayman_edit_reservation(uuid,jsonb,jsonb),public.claim_guest_checkin(text),public.complete_guest_checkin(uuid,jsonb) from public,anon;
grant execute on function public.stayman_member_details(uuid),public.stayman_add_member(uuid,text,uuid),public.stayman_reissue_member(uuid),
 public.stayman_edit_reservation(uuid,jsonb,jsonb),public.claim_guest_checkin(text),public.complete_guest_checkin(uuid,jsonb) to authenticated;
create or replace function public.can_write_guest_identity(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.guest_checkin_invitations i
 where i.user_id=auth.uid() and i.status='draft' and i.expires_at>now()
 and object_name in (i.id::text||'/front.jpg',i.id::text||'/back.jpg')
 and not exists(select 1 from public.stayman_booking_members m
 join public.stayman_reservations r on r.id=m.reservation_id
 where m.invitation_id=i.id and r.status not in ('PENDING','CHECKED_IN')));
$$;

notify pgrst,'reload schema';
commit;
