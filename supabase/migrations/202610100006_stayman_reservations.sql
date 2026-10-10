-- Run once as administrator. Independent of legacy rooms/guests/reservations tables.
begin;
set local search_path = public, extensions;
create extension if not exists btree_gist with schema extensions;
create table public.stayman_properties (
  id uuid primary key default gen_random_uuid(), name text not null
);
create table public.stayman_staff (
  property_id uuid references public.stayman_properties(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key(property_id,user_id)
);
create function public.stayman_is_staff(p_property uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
    and exists(select 1 from public.stayman_staff where property_id=p_property and user_id=auth.uid());
$$;
revoke all on function public.stayman_is_staff(uuid) from public,anon;
grant execute on function public.stayman_is_staff(uuid) to authenticated;
create table public.stayman_units (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
  room_name text not null, label text not null, unit_type text not null check(unit_type in ('BED','ROOM')),
  gender_policy text not null default 'ANY' check(gender_policy in ('ANY','FEMALE_ONLY','MALE_ONLY')),
  unique(id,property_id)
);
create table public.stayman_guests (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
  full_name text not null check(length(trim(full_name)) between 2 and 100),
  phone text not null check(phone ~ '^[+0-9() .-]{7,25}$'),
  email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  nationality text not null default 'India', gender text not null default 'OTHER' check(gender in ('MALE','FEMALE','OTHER')),
  created_at timestamptz not null default now(), unique(id,property_id)
);
create table public.stayman_reservations (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
  guest_id uuid not null, booking_ref text not null unique,
  check_in_date date not null, check_out_date date not null check(check_out_date>check_in_date),
  status text not null default 'PENDING' check(status in ('PENDING','CHECKED_IN','CHECKED_OUT','CANCELLED')),
  total_amount bigint not null default 0 check(total_amount>=0), paid_amount bigint not null default 0 check(paid_amount>=0 and paid_amount<=total_amount),
  source text not null default 'Direct Booking', notes text not null default '' check(length(notes)<=1000),
  created_at timestamptz not null default now(), unique(id,property_id),
  foreign key(guest_id,property_id) references public.stayman_guests(id,property_id)
);
create table public.stayman_allocations (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
  reservation_id uuid, unit_id uuid not null, check_in_date date not null,
  check_out_date date not null check(check_out_date>check_in_date),
  status text not null check(status in ('PENDING','CHECKED_IN','MAINTENANCE')),
  reason text, foreign key(unit_id,property_id) references public.stayman_units(id,property_id),
  foreign key(reservation_id,property_id) references public.stayman_reservations(id,property_id),
  check((status='MAINTENANCE' and reservation_id is null and reason is not null and length(trim(reason)) between 1 and 50)
    or (status<>'MAINTENANCE' and reservation_id is not null)),
  exclude using gist (unit_id with =, daterange(check_in_date,check_out_date,'[)') with &&)
);
-- No client-side table writes. Mutations go through authorized transaction RPCs.
do $$ declare name text; begin
  foreach name in array array['stayman_properties','stayman_staff','stayman_units','stayman_guests','stayman_reservations','stayman_allocations'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon,authenticated',name);
    execute format('grant select on public.%I to authenticated',name);
  end loop;
end $$;
create policy staff_own_membership on public.stayman_staff for select to authenticated
  using(user_id=auth.uid() and coalesce(auth.jwt()->>'is_anonymous','false')<>'true');
create policy staff_properties on public.stayman_properties for select to authenticated using(public.stayman_is_staff(id));
create policy staff_units on public.stayman_units for select to authenticated using(public.stayman_is_staff(property_id));
create policy staff_guests on public.stayman_guests for select to authenticated using(public.stayman_is_staff(property_id));
create policy staff_reservations on public.stayman_reservations for select to authenticated using(public.stayman_is_staff(property_id));
create policy staff_allocations on public.stayman_allocations for select to authenticated using(public.stayman_is_staff(property_id));
create index on public.stayman_guests(property_id);
create index on public.stayman_reservations(property_id);
create index on public.stayman_allocations(property_id);

create function public.stayman_create_booking(p_unit uuid,p_details jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.stayman_units; g uuid; r uuid; arrive date; depart date; gender text; total bigint; paid bigint; booking_status text;
begin
  select * into u from public.stayman_units where id=p_unit;
  if not found or not public.stayman_is_staff(u.property_id) then raise exception 'Staff access required.'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid booking details.'; end if;
  arrive:=(p_details->>'checkInDate')::date; depart:=(p_details->>'checkOutDate')::date;
  gender:=coalesce(p_details->>'gender','OTHER');
  total:=coalesce((p_details->>'totalAmountPaise')::bigint,0); paid:=coalesce((p_details->>'paidAmountPaise')::bigint,0);
  booking_status:=coalesce(p_details->>'status','PENDING');
  if arrive is null or depart is null or depart<=arrive or booking_status not in ('PENDING','CHECKED_IN') then raise exception 'Invalid dates or status.'; end if;
  if (u.gender_policy='FEMALE_ONLY' and gender<>'FEMALE') or (u.gender_policy='MALE_ONLY' and gender<>'MALE') then raise exception 'Guest gender does not match room policy.'; end if;
  insert into public.stayman_guests(property_id,full_name,phone,email,nationality,gender)
    values(u.property_id,trim(p_details->>'guestName'),trim(p_details->>'phone'),nullif(trim(p_details->>'email'),''),
      coalesce(nullif(trim(p_details->>'nationality'),''),'India'),gender) returning id into g;
  insert into public.stayman_reservations(property_id,guest_id,booking_ref,check_in_date,check_out_date,status,total_amount,paid_amount,source,notes)
    values(u.property_id,g,'ST-'||gen_random_uuid()::text,arrive,depart,booking_status,total,paid,
      coalesce(p_details->>'source','Direct Booking'),coalesce(p_details->>'notes','')) returning id into r;
  insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status)
    values(u.property_id,r,p_unit,arrive,depart,booking_status);
  return r;
end $$;
create function public.stayman_mark_maintenance(p_unit uuid,p_day date,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.stayman_units; result uuid;
begin
  select * into u from public.stayman_units where id=p_unit;
  if not found or not public.stayman_is_staff(u.property_id) then raise exception 'Staff access required.'; end if;
  if p_day is null or p_reason is null or length(trim(p_reason)) not between 1 and 50 then raise exception 'Valid date and maintenance description required.'; end if;
  insert into public.stayman_allocations(property_id,unit_id,check_in_date,check_out_date,status,reason)
    values(u.property_id,p_unit,p_day,p_day+1,'MAINTENANCE',trim(p_reason)) returning id into result;
  return result;
end $$;
create function public.stayman_move_night(p_allocation uuid,p_target uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
declare a public.stayman_allocations; target public.stayman_units; source public.stayman_units; gender text;
begin
  select * into a from public.stayman_allocations where id=p_allocation for update;
  if not found or not public.stayman_is_staff(a.property_id) then raise exception 'Staff access required.'; end if;
  if a.status='MAINTENANCE' or p_day is null or p_day<a.check_in_date or p_day>=a.check_out_date then raise exception 'Invalid move date.'; end if;
  select * into target from public.stayman_units where id=p_target and property_id=a.property_id;
  if not found or p_target=a.unit_id then raise exception 'Invalid destination.'; end if;
  select * into source from public.stayman_units where id=a.unit_id;
  if target.unit_type<>source.unit_type then raise exception 'Choose the same accommodation type.'; end if;
  select g.gender into gender from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id where r.id=a.reservation_id;
  if (target.gender_policy='FEMALE_ONLY' and gender<>'FEMALE') or (target.gender_policy='MALE_ONLY' and gender<>'MALE') then raise exception 'Guest gender does not match room policy.'; end if;
  -- Atomic split: exclusion constraint rejects any concurrent overlap; rollback restores source.
  delete from public.stayman_allocations where id=a.id;
  if a.check_in_date<p_day then
    insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status)
      values(a.property_id,a.reservation_id,a.unit_id,a.check_in_date,p_day,a.status);
  end if;
  insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status)
    values(a.property_id,a.reservation_id,p_target,p_day,p_day+1,a.status);
  if p_day+1<a.check_out_date then
    insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status)
      values(a.property_id,a.reservation_id,a.unit_id,p_day+1,a.check_out_date,a.status);
  end if;
end $$;
revoke all on function public.stayman_create_booking(uuid,jsonb),public.stayman_mark_maintenance(uuid,date,text),public.stayman_move_night(uuid,uuid,date) from public,anon;
grant execute on function public.stayman_create_booking(uuid,jsonb),public.stayman_mark_maintenance(uuid,date,text),public.stayman_move_night(uuid,uuid,date) to authenticated;
notify pgrst,'reload schema';

commit;
