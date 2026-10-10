-- Apply once AFTER 009. Public walk-in inbox, explicit linking, and country digit limits.
begin;
alter table public.guest_checkin_invitations add column property_id uuid references public.stayman_properties(id);
alter table public.stayman_booking_members add column guest_id uuid;
alter table public.stayman_booking_members add foreign key(guest_id,property_id) references public.stayman_guests(id,property_id);
create unique index stayman_member_contact on public.stayman_booking_members(reservation_id,guest_id) where guest_id is not null;
update public.guest_checkin_invitations i set property_id=m.property_id
 from public.stayman_booking_members m where m.invitation_id=i.id;
-- A legacy permanent QR had no property identifier. Assign it only if there is exactly one property.
update public.guest_checkin_invitations set property_id=(select id from public.stayman_properties limit 1)
 where source='public_qr' and property_id is null and (select count(*) from public.stayman_properties)=1;
create index on public.guest_checkin_invitations(property_id,status);
drop index public.one_public_checkin_per_session;
create unique index one_public_checkin_per_property_session on public.guest_checkin_invitations(user_id,property_id) where source='public_qr';

alter function public.start_public_guest_checkin() rename to start_public_guest_checkin_legacy;
revoke all on function public.start_public_guest_checkin_legacy() from public,anon,authenticated;
create function public.start_public_guest_checkin(p_property uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare guest public.guest_checkin_invitations; target uuid:=p_property; today date:=(now() at time zone 'Asia/Kolkata')::date; reserved integer;
begin
 if auth.uid() is null then raise exception 'A guest session is required.'; end if;
 if target is null then
  if (select count(*) from public.stayman_properties)<>1 then raise exception 'Please scan the property QR code or contact the manager.'; end if;
  select id into target from public.stayman_properties limit 1;
 end if;
 if not exists(select 1 from public.stayman_properties where id=target) then raise exception 'Invalid property. Contact the manager.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,73481));
 select * into guest from public.guest_checkin_invitations where user_id=auth.uid() and source='public_qr' and property_id=target for update;
 if found then
  if guest.status='completed' then return jsonb_build_object('id',guest.id,'status','completed'); end if;
  if guest.expires_at>now() then return jsonb_build_object('id',guest.id,'status','draft','email',''); end if;
 end if;
 insert into public.guest_checkin_daily_usage(day) values(today) on conflict do nothing;
 update public.guest_checkin_daily_usage set submissions=submissions+1 where day=today and submissions<100 returning submissions into reserved;
 if not found then raise exception 'Daily check-in limit reached. Please contact the manager.'; end if;
 if guest.id is not null then
  update public.guest_checkin_invitations set expires_at=((today+1)::timestamp at time zone 'Asia/Kolkata') where id=guest.id;
 else
  insert into public.guest_checkin_invitations(token_hash,email,expires_at,user_id,source,property_id)
  values(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),'pending@stayman.invalid',
   ((today+1)::timestamp at time zone 'Asia/Kolkata'),auth.uid(),'public_qr',target) returning * into guest;
 end if;
 return jsonb_build_object('id',guest.id,'status','draft','email','');
end $$;

drop function public.stayman_member_details(uuid);
create function public.stayman_member_details(p_property uuid)
returns table(id uuid,reservation_id uuid,display_name text,invitation_id uuid,status text,details jsonb,completed_at timestamptz,guest_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 return query select m.id,m.reservation_id,m.display_name,i.id,i.status,i.details,i.completed_at,m.guest_id
 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
 where m.property_id=p_property order by m.created_at,m.id;
end $$;
create function public.stayman_walkins(p_property uuid)
returns table(id uuid,invitation_id uuid,status text,details jsonb,completed_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 return query select i.id,i.id,i.status,i.details,i.completed_at from public.guest_checkin_invitations i
 where i.property_id=p_property and i.source='public_qr' and i.status='completed'
 and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id)
 order by i.completed_at desc,i.id;
end $$;

create policy staff_property_invitation_read on public.guest_checkin_invitations for select to authenticated
 using(property_id is not null and public.stayman_is_staff(property_id));
create policy staff_property_identity_read on storage.objects for select to authenticated
 using(bucket_id='guest-identities' and exists(select 1 from public.guest_checkin_invitations i
 where i.status='completed' and i.property_id is not null and public.stayman_is_staff(i.property_id)
 and name in (i.id::text||'/front.jpg',i.id::text||'/back.jpg')));

create function public.stayman_attach_walkin(p_reservation uuid,p_invitation uuid,p_as_contact boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; i public.guest_checkin_invitations; result uuid;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status not in ('PENDING','CHECKED_IN') then raise exception 'Choose an active booking.'; end if;
 select * into i from public.guest_checkin_invitations where id=p_invitation for update;
 if not found or i.property_id is distinct from r.property_id or i.source<>'public_qr' or i.status<>'completed' then raise exception 'Completed walk-in not found in this property.'; end if;
 if exists(select 1 from public.stayman_booking_members where invitation_id=i.id) then raise exception 'This guest was already linked. Refresh the list.'; end if;
 if (select count(*) from public.stayman_booking_members where reservation_id=r.id)>=50 then raise exception 'Maximum 50 guests per booking.'; end if;
 insert into public.stayman_booking_members(property_id,reservation_id,display_name,invitation_id,guest_id)
 values(r.property_id,r.id,i.details->>'full_name',i.id,case when p_as_contact then r.guest_id else null end) returning id into result;
 return result;
end $$;

alter function public.stayman_create_booking(uuid,jsonb) rename to stayman_create_booking_validated;
revoke all on function public.stayman_create_booking_validated(uuid,jsonb) from public,anon,authenticated;
create function public.stayman_create_booking(p_unit uuid,p_details jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; i public.guest_checkin_invitations; property uuid; r public.stayman_reservations;
begin
 select property_id into property from public.stayman_units where id=p_unit;
 if not found or not public.stayman_is_staff(property) then raise exception 'Staff access required.'; end if;
 if nullif(p_details->>'webCheckinId','') is not null then
  select * into i from public.guest_checkin_invitations where id=(p_details->>'webCheckinId')::uuid for update;
  if not found or i.property_id is distinct from property or i.status<>'completed' or i.source<>'public_qr'
   or exists(select 1 from public.stayman_booking_members where invitation_id=i.id) then
   raise exception 'This walk-in is unavailable or already allocated. Refresh the list.';
  end if;
 end if;
 result:=public.stayman_create_booking_validated(p_unit,p_details);
 if i.id is not null then
  select * into r from public.stayman_reservations where id=result;
  insert into public.stayman_booking_members(property_id,reservation_id,display_name,invitation_id,guest_id)
  values(property,result,i.details->>'full_name',i.id,r.guest_id);
 end if;
 return result;
end $$;

create function public.stayman_guest_checkin_link(p_guest uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.stayman_guests; r public.stayman_reservations; m public.stayman_booking_members; result jsonb; today date;
begin
 select * into g from public.stayman_guests where id=p_guest;
 if not found or not public.stayman_is_staff(g.property_id) then raise exception 'Staff access required.'; end if;
 select (now() at time zone p.timezone)::date into today from public.stayman_properties p where p.id=g.property_id;
 select * into r from public.stayman_reservations where guest_id=g.id and status in ('PENDING','CHECKED_IN')
 and check_out_date>today order by check_in_date desc,id limit 1 for update;
 if not found then raise exception 'Create an active reservation for this guest before requesting web check-in.'; end if;
 select * into m from public.stayman_booking_members where reservation_id=r.id and guest_id=g.id;
 if found then
  if exists(select 1 from public.guest_checkin_invitations where id=m.invitation_id and status='completed') then return jsonb_build_object('status','completed'); end if;
  return jsonb_build_object('token',public.stayman_reissue_member(m.id),'id',m.id);
 end if;
 result:=public.stayman_add_member(r.id,g.full_name,gen_random_uuid());
 update public.stayman_booking_members set guest_id=g.id where id=(result->>'id')::uuid;
 return result;
end $$;
create function public.stayman_bind_member(p_guest uuid,p_member uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.stayman_booking_members; r public.stayman_reservations;
begin
 select r0.* into r from public.stayman_booking_members m0 join public.stayman_reservations r0 on r0.id=m0.reservation_id where m0.id=p_member for update of r0;
 if not found or not public.stayman_is_staff(r.property_id) or r.guest_id<>p_guest then raise exception 'Booking contact not found.'; end if;
 select * into m from public.stayman_booking_members where id=p_member for update;
 if m.guest_id is not null and m.guest_id<>p_guest then raise exception 'Guest record already linked.'; end if;
 update public.stayman_booking_members set guest_id=p_guest where id=m.id;
end $$;
revoke all on function public.start_public_guest_checkin(uuid),public.stayman_member_details(uuid),public.stayman_walkins(uuid),
 public.stayman_attach_walkin(uuid,uuid,boolean),public.stayman_create_booking(uuid,jsonb),public.stayman_guest_checkin_link(uuid),public.stayman_bind_member(uuid,uuid) from public,anon;
grant execute on function public.start_public_guest_checkin(uuid),public.stayman_member_details(uuid),public.stayman_walkins(uuid),
 public.stayman_attach_walkin(uuid,uuid,boolean),public.stayman_create_booking(uuid,jsonb),public.stayman_guest_checkin_link(uuid),public.stayman_bind_member(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
