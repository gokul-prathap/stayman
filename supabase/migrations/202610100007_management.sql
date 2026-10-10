-- Apply ONCE after migration 006. Existing staff memberships are treated as owners.
begin;
alter table public.stayman_staff add column role text not null default 'OWNER'
  check (role in ('OWNER','MANAGER'));
alter table public.stayman_properties
  add column address text not null default '' check(length(address)<=500),
  add column phone text not null default '' check(length(phone)<=25),
  add column currency text not null default 'INR' check(currency='INR'),
  add column timezone text not null default 'Asia/Kolkata',
  add column check_in_time time not null default '14:00',
  add column check_out_time time not null default '11:00';
alter table public.stayman_units add column nightly_rate_paise bigint not null default 0
  check(nightly_rate_paise between 0 and 100000000);

create function public.stayman_is_owner(p_property uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.stayman_is_staff(p_property)
    and exists(select 1 from public.stayman_staff where property_id=p_property and user_id=auth.uid() and role='OWNER');
$$;
revoke all on function public.stayman_is_owner(uuid) from public,anon;
grant execute on function public.stayman_is_owner(uuid) to authenticated;

create table public.stayman_payments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.stayman_properties(id),
  reservation_id uuid not null,
  amount_paise bigint not null check(amount_paise>0),
  method text not null check(method in ('CASH','UPI','CARD','BANK','OPENING')),
  note text not null default '' check(length(note)<=250),
  recorded_by uuid references auth.users(id),
  paid_at timestamptz not null default now(),
  request_id uuid not null unique,
  foreign key(reservation_id,property_id) references public.stayman_reservations(id,property_id)
);
alter table public.stayman_payments enable row level security;
revoke all on public.stayman_payments from public,anon,authenticated;
grant select on public.stayman_payments to authenticated;
create policy staff_payments on public.stayman_payments for select to authenticated
  using(public.stayman_is_staff(property_id));
create index on public.stayman_payments(property_id,paid_at);
-- Existing paid totals lack historic payment dates: preserve them as opening balances.
insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,paid_at,request_id)
select property_id,id,paid_amount,'OPENING','Opening balance imported from reservation',created_at,gen_random_uuid()
from public.stayman_reservations where paid_amount>0;

create function public.stayman_initial_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.paid_amount>0 then
    insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,recorded_by,request_id)
    values(new.property_id,new.id,new.paid_amount,'OPENING','Initial payment entered at booking',auth.uid(),gen_random_uuid());
  end if;
  return new;
end $$;
revoke all on function public.stayman_initial_payment() from public,anon,authenticated;
create trigger stayman_initial_payment after insert on public.stayman_reservations
for each row execute function public.stayman_initial_payment();

create function public.stayman_record_payment(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; existing public.stayman_payments; result uuid;
begin
  select * into r from public.stayman_reservations where id=p_reservation for update;
  if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
  if p_request is null then raise exception 'Payment request ID required.'; end if;
  select * into existing from public.stayman_payments where request_id=p_request;
  if found then
    if existing.reservation_id<>p_reservation or existing.amount_paise is distinct from p_amount
      or existing.method is distinct from p_method or existing.note is distinct from coalesce(trim(p_note),'') then
      raise exception 'Payment request already used with different details.';
    end if;
    return existing.id;
  end if;
  if r.status='CANCELLED' then raise exception 'Cannot record payment for a cancelled reservation.'; end if;
  if p_amount is null or p_amount<=0 or p_amount>r.total_amount-r.paid_amount then
    raise exception 'Payment must be positive and cannot exceed the outstanding balance.';
  end if;
  if p_method is null or p_method not in ('CASH','UPI','CARD','BANK') or length(coalesce(p_note,''))>250 then
    raise exception 'Invalid payment method or note.';
  end if;
  insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,recorded_by,request_id)
    values(r.property_id,r.id,p_amount,p_method,coalesce(trim(p_note),''),auth.uid(),p_request) returning id into result;
  update public.stayman_reservations set paid_amount=paid_amount+p_amount where id=r.id;
  return result;
end $$;

create function public.stayman_save_rates(p_property uuid,p_rates jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; rate bigint; unit_id uuid;
begin
  if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to change pricing.'; end if;
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

create function public.stayman_save_settings(p_property uuid,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to change settings.'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object'
    or coalesce(length(trim(p_details->>'name')),0) not between 2 and 100
    or coalesce(length(p_details->>'address'),0)>500
    or coalesce(length(p_details->>'phone'),0)>25
    or coalesce(p_details->>'currency','')<>'INR'
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_details->>'timezone')
    or coalesce(p_details->>'check_in_time','') !~ '^[0-9]{2}:[0-9]{2}$'
    or coalesce(p_details->>'check_out_time','') !~ '^[0-9]{2}:[0-9]{2}$' then
    raise exception 'Please provide valid property settings.';
  end if;
  update public.stayman_properties set name=trim(p_details->>'name'),address=coalesce(trim(p_details->>'address'),''),
    phone=coalesce(trim(p_details->>'phone'),''),currency='INR',timezone=p_details->>'timezone',
    check_in_time=(p_details->>'check_in_time')::time,check_out_time=(p_details->>'check_out_time')::time
    where id=p_property;
end $$;

create function public.stayman_team(p_property uuid)
returns table(user_id uuid,email text,role text)
language plpgsql security definer set search_path='' as $$
begin
  if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
  return query select s.user_id,u.email::text,s.role from public.stayman_staff s
    join auth.users u on u.id=s.user_id where s.property_id=p_property order by u.email;
end $$;
revoke all on function public.stayman_record_payment(uuid,bigint,text,text,uuid),
 public.stayman_save_rates(uuid,jsonb),public.stayman_save_settings(uuid,jsonb),public.stayman_team(uuid) from public,anon;
grant execute on function public.stayman_record_payment(uuid,bigint,text,text,uuid),
 public.stayman_save_rates(uuid,jsonb),public.stayman_save_settings(uuid,jsonb),public.stayman_team(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
