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
 and check_out_date>today order by (check_in_date<=today) desc,check_in_date,id limit 1 for update;
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
-- Frozen numbering-length snapshot from the installed libphonenumber metadata.
create table public.stayman_phone_lengths(calling_code text primary key,possible_lengths integer[] not null);
alter table public.stayman_phone_lengths enable row level security;
revoke all on public.stayman_phone_lengths from public,anon,authenticated;
insert into public.stayman_phone_lengths(calling_code,possible_lengths) values
('1',array[10]),
('20',array[8,9,10]),
('211',array[9]),
('212',array[9]),
('213',array[8,9]),
('216',array[8]),
('218',array[9]),
('220',array[7,9]),
('221',array[9]),
('222',array[8]),
('223',array[8]),
('224',array[8,9]),
('225',array[10]),
('226',array[8]),
('227',array[8]),
('228',array[8]),
('229',array[10]),
('230',array[7,8]),
('231',array[7,8,9]),
('232',array[8]),
('233',array[9]),
('234',array[10]),
('235',array[8]),
('236',array[8]),
('237',array[9]),
('238',array[7]),
('239',array[7]),
('240',array[9]),
('241',array[7,8]),
('242',array[9]),
('243',array[7,8,9,10]),
('244',array[9]),
('245',array[9]),
('246',array[7]),
('247',array[5]),
('248',array[7]),
('249',array[9]),
('250',array[8,9]),
('251',array[9]),
('252',array[6,7,8,9]),
('253',array[8]),
('254',array[7,8,9]),
('255',array[9]),
('256',array[9]),
('257',array[8]),
('258',array[8,9]),
('260',array[9]),
('261',array[9]),
('262',array[9]),
('263',array[7,9]),
('264',array[8,9]),
('265',array[7,9]),
('266',array[8]),
('267',array[7,8]),
('268',array[8]),
('269',array[7]),
('27',array[5,6,7,8,9]),
('290',array[4,5]),
('291',array[7]),
('297',array[7]),
('298',array[6]),
('299',array[6]),
('30',array[10]),
('31',array[9,11]),
('32',array[8,9]),
('33',array[9]),
('34',array[9]),
('350',array[8]),
('351',array[9]),
('352',array[4,5,6,7,8,9,10,11]),
('353',array[7,8,9,10]),
('354',array[7,9]),
('355',array[8,9]),
('356',array[8]),
('357',array[8]),
('358',array[5,6,7,8,9,10]),
('359',array[6,7,8,9]),
('36',array[8,9]),
('370',array[8]),
('371',array[8]),
('372',array[7,8]),
('373',array[8]),
('374',array[8]),
('375',array[9]),
('376',array[6,9]),
('377',array[8,9]),
('378',array[8,10]),
('380',array[9]),
('381',array[7,8,9,10,11,12]),
('382',array[8]),
('383',array[8,9,10,11,12]),
('385',array[8,9]),
('386',array[8]),
('387',array[8,9]),
('389',array[8]),
('39',array[6,7,8,9,10,11,12]),
('40',array[6,9]),
('41',array[9]),
('420',array[9]),
('421',array[6,7,9]),
('423',array[7,9]),
('43',array[4,5,6,7,8,9,10,11,12,13]),
('44',array[9,10]),
('45',array[8]),
('46',array[7,8,9]),
('47',array[8]),
('48',array[7,9]),
('49',array[5,6,7,8,9,10,11,12,13]),
('500',array[5]),
('501',array[7]),
('502',array[8]),
('503',array[8]),
('504',array[8]),
('505',array[8]),
('506',array[8]),
('507',array[7,8]),
('508',array[6,9]),
('509',array[8]),
('51',array[8,9]),
('52',array[10]),
('53',array[6,7,8,10]),
('54',array[10,11]),
('55',array[10,11]),
('56',array[9]),
('57',array[8,10]),
('58',array[10]),
('590',array[9]),
('591',array[8]),
('592',array[7]),
('593',array[8,9]),
('594',array[9]),
('595',array[7,8,9]),
('596',array[9]),
('597',array[6,7]),
('598',array[8]),
('599',array[7,8]),
('60',array[8,9,10]),
('61',array[9]),
('62',array[7,8,9,10,11,12]),
('63',array[6,8,9,10]),
('64',array[8,9,10]),
('65',array[8]),
('66',array[8,9]),
('670',array[7,8]),
('672',array[6]),
('673',array[7]),
('674',array[7]),
('675',array[7,8]),
('676',array[5,7]),
('677',array[5,7]),
('678',array[5,7]),
('679',array[7]),
('680',array[7]),
('681',array[6]),
('682',array[5]),
('683',array[4,7]),
('685',array[5,6,7,10]),
('686',array[5,8]),
('687',array[6]),
('688',array[5,6,7]),
('689',array[8]),
('690',array[4,5,6,7]),
('691',array[7]),
('692',array[7]),
('7',array[10]),
('81',array[9,10]),
('82',array[5,6,8,9,10]),
('84',array[9,10]),
('850',array[8,10]),
('852',array[8]),
('853',array[8]),
('855',array[8,9]),
('856',array[8,9,10]),
('86',array[7,8,9,10,11]),
('880',array[6,7,8,9,10]),
('886',array[8,9]),
('90',array[10]),
('91',array[10]),
('92',array[9,10]),
('93',array[9]),
('94',array[9]),
('95',array[6,7,8,9,10]),
('960',array[7]),
('961',array[7,8]),
('962',array[8,9]),
('963',array[8,9]),
('964',array[8,9,10]),
('965',array[8]),
('966',array[9]),
('967',array[7,8,9]),
('968',array[8]),
('970',array[8,9]),
('971',array[8,9]),
('972',array[8,9,11,12]),
('973',array[8]),
('974',array[8]),
('975',array[7,8]),
('976',array[8,9,10]),
('977',array[8,10]),
('98',array[6,7,10]),
('992',array[9]),
('993',array[8]),
('994',array[9]),
('995',array[9]),
('996',array[9]),
('998',array[9]);
create function public.stayman_phone_length_valid(p_phone text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare value text; rule public.stayman_phone_lengths;
begin
 if p_phone is null or p_phone !~ '^[+]?[0-9() .-]+$' then return false; end if;
 value:=regexp_replace(p_phone,'[() .-]','','g');
 if value not like '+%' then value:='+91'||value; end if;
 if length(value)>16 then return false; end if;
 select * into rule from public.stayman_phone_lengths where substring(value from 2) like calling_code||'%'
 order by length(calling_code) desc limit 1;
 if not found then return false; end if;
 return length(value)-1-length(rule.calling_code)=any(rule.possible_lengths);
end $$;
revoke all on function public.stayman_phone_length_valid(text) from public,anon,authenticated;
create function public.stayman_validate_phone_length() returns trigger
language plpgsql security definer set search_path='' as $$
declare value text;
begin
 if tg_table_name='stayman_guests' then value:=new.phone;
 else
  if new.status<>'completed' or new.details is null then return new; end if;
  value:=new.details->>'phone';
 end if;
 if not public.stayman_phone_length_valid(value) then raise exception 'Phone number length does not match its country code.'; end if;
 return new;
end $$;
revoke all on function public.stayman_validate_phone_length() from public,anon,authenticated;
create trigger stayman_guest_phone_length before insert or update of phone on public.stayman_guests
 for each row execute function public.stayman_validate_phone_length();
create trigger stayman_web_phone_length before insert or update of details on public.guest_checkin_invitations
 for each row execute function public.stayman_validate_phone_length();

notify pgrst,'reload schema';
commit;
