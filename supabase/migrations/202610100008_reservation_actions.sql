-- Apply once after 007. Booking charges may be below net receipts after a downgrade.
begin;
alter table public.stayman_reservations
 add column cancellation_reason text check(length(cancellation_reason) between 3 and 250),
 add column cancelled_at timestamptz,
 add column cancelled_by uuid references auth.users(id),
 add column cancelled_allocations jsonb;
do $$ declare c record; begin
 for c in select conname from pg_catalog.pg_constraint where conrelid='public.stayman_reservations'::regclass
  and contype='c' and pg_catalog.pg_get_constraintdef(oid) like '%paid_amount%' and pg_catalog.pg_get_constraintdef(oid) like '%total_amount%' loop
  execute format('alter table public.stayman_reservations drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.stayman_reservations add constraint stayman_nonnegative_net_paid check(paid_amount>=0);
alter table public.stayman_payments add column kind text not null default 'RECEIPT' check(kind in ('RECEIPT','REFUND'));
alter table public.stayman_allocations add column charge_paise bigint check(charge_paise>=0);
-- Preserve the original booking total exactly across any existing split allocations.
with parts as (
 select a.id,r.total_amount,
 sum(a.check_out_date-a.check_in_date) over(partition by r.id) as duration,
 sum(a.check_out_date-a.check_in_date) over(partition by r.id order by a.check_in_date,a.id) as through,
 a.check_out_date-a.check_in_date as span
 from public.stayman_allocations a join public.stayman_reservations r on r.id=a.reservation_id
)
update public.stayman_allocations a set charge_paise=
 floor(p.total_amount::numeric*p.through/p.duration)-floor(p.total_amount::numeric*(p.through-p.span)/p.duration)
from parts p where a.id=p.id;
update public.stayman_allocations set charge_paise=0 where charge_paise is null;
alter table public.stayman_allocations alter column charge_paise set not null;

create function public.stayman_allocation_charge() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; today date;
begin
 if new.status='MAINTENANCE' then new.charge_paise:=0;
 elsif new.charge_paise is null then
  select * into r from public.stayman_reservations where id=new.reservation_id;
  if new.check_in_date<>r.check_in_date or new.check_out_date<>r.check_out_date
   or exists(select 1 from public.stayman_allocations where reservation_id=new.reservation_id) then
   raise exception 'An explicit charge is required for split allocations.';
  end if;
  if r.paid_amount>r.total_amount then raise exception 'Initial payment cannot exceed booking total.'; end if;
  select (now() at time zone p.timezone)::date into today from public.stayman_properties p where p.id=r.property_id;
  if r.status='CHECKED_IN' and (today<r.check_in_date or today>=r.check_out_date) then raise exception 'A walk-in must include today in its stay dates.'; end if;
  new.charge_paise:=r.total_amount;
 end if;
 return new;
end $$;
revoke all on function public.stayman_allocation_charge() from public,anon,authenticated;
create trigger stayman_allocation_charge before insert on public.stayman_allocations
for each row execute function public.stayman_allocation_charge();

create table public.stayman_transfers (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
 reservation_id uuid not null, target_unit uuid not null references public.stayman_units(id),
 from_date date not null, to_date date not null, total_before bigint not null, total_after bigint not null,
 paid_snapshot bigint not null, request_id uuid not null unique, recorded_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(reservation_id,property_id) references public.stayman_reservations(id,property_id)
);
alter table public.stayman_transfers enable row level security;
revoke all on public.stayman_transfers from public,anon,authenticated;
grant select on public.stayman_transfers to authenticated;
create policy staff_transfers on public.stayman_transfers for select to authenticated using(public.stayman_is_staff(property_id));

create function public.stayman_transfer(p_reservation uuid,p_target uuid,p_from date,p_to date,
 p_expected_total bigint,p_expected_new_total bigint,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; target public.stayman_units; a public.stayman_allocations;
 previous public.stayman_transfers; gender text; duration integer; left_days integer; through_days integer;
 first_day date; last_day date; before_charge bigint; through_charge bigint; removed bigint:=0;
 coverage integer:=0; new_total bigint; has_change boolean:=false;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if p_request is null then raise exception 'Move request ID required.'; end if;
 select * into previous from public.stayman_transfers where request_id=p_request;
 if found then
  if previous.reservation_id<>p_reservation or previous.target_unit<>p_target
   or previous.from_date is distinct from p_from or previous.to_date is distinct from p_to
   or previous.total_before is distinct from p_expected_total or previous.total_after is distinct from p_expected_new_total then
   raise exception 'Move request already used with different details.';
  end if;
  return jsonb_build_object('total',previous.total_after,'paid',previous.paid_snapshot);
 end if;
 if r.status not in ('PENDING','CHECKED_IN') or p_from is null or p_to is null
  or p_from<r.check_in_date or p_to>r.check_out_date or p_to<=p_from then raise exception 'Invalid move dates or reservation status.'; end if;
 select * into target from public.stayman_units where id=p_target and property_id=r.property_id for share;
 if not found then raise exception 'Destination is not in this property.'; end if;
 select g.gender into gender from public.stayman_guests g where g.id=r.guest_id;
 if (target.gender_policy='FEMALE_ONLY' and gender<>'FEMALE') or (target.gender_policy='MALE_ONLY' and gender<>'MALE') then
  raise exception 'Guest gender does not match room policy.';
 end if;
 for a in select * from public.stayman_allocations where reservation_id=r.id
  and check_in_date<p_to and check_out_date>p_from order by id for update loop
  first_day:=greatest(a.check_in_date,p_from); last_day:=least(a.check_out_date,p_to);
  duration:=a.check_out_date-a.check_in_date;
  before_charge:=floor(a.charge_paise::numeric*(first_day-a.check_in_date)/duration);
  through_charge:=floor(a.charge_paise::numeric*(last_day-a.check_in_date)/duration);
  removed:=removed+through_charge-before_charge;
  coverage:=coverage+(last_day-first_day);
  has_change:=has_change or a.unit_id<>p_target;
 end loop;
 if coverage<>p_to-p_from or not has_change then raise exception 'Choose allocated nights and a different destination.'; end if;
 new_total:=r.total_amount-removed+target.nightly_rate_paise*(p_to-p_from);
 if p_expected_total is distinct from r.total_amount or p_expected_new_total is distinct from new_total then
  raise exception 'Booking charges or room rates changed. Refresh and review the move again.';
 end if;
 for a in select * from public.stayman_allocations where reservation_id=r.id
  and check_in_date<p_to and check_out_date>p_from order by id for update loop
  first_day:=greatest(a.check_in_date,p_from); last_day:=least(a.check_out_date,p_to);
  duration:=a.check_out_date-a.check_in_date;
  before_charge:=floor(a.charge_paise::numeric*(first_day-a.check_in_date)/duration);
  through_charge:=floor(a.charge_paise::numeric*(last_day-a.check_in_date)/duration);
  delete from public.stayman_allocations where id=a.id;
  if a.check_in_date<first_day then
   insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
   values(a.property_id,r.id,a.unit_id,a.check_in_date,first_day,a.status,before_charge);
  end if;
  if last_day<a.check_out_date then
   insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
   values(a.property_id,r.id,a.unit_id,last_day,a.check_out_date,a.status,a.charge_paise-through_charge);
  end if;
 end loop;
 -- The existing exclusion constraint rejects occupied destinations, including concurrent bookings.
 insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
 values(r.property_id,r.id,p_target,p_from,p_to,r.status,target.nightly_rate_paise*(p_to-p_from));
 update public.stayman_reservations set total_amount=new_total where id=r.id;
 insert into public.stayman_transfers(property_id,reservation_id,target_unit,from_date,to_date,total_before,total_after,paid_snapshot,request_id,recorded_by)
 values(r.property_id,r.id,p_target,p_from,p_to,r.total_amount,new_total,r.paid_amount,p_request,auth.uid());
 return jsonb_build_object('total',new_total,'paid',r.paid_amount);
end $$;

-- Old clients cannot perform unquoted moves after charges become allocation-specific.
create or replace function public.stayman_move_night(p_allocation uuid,p_target uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Refresh the application to review the price before moving.'; end $$;

create function public.stayman_check_in(p_reservation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; today date;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select (now() at time zone p.timezone)::date into today from public.stayman_properties p where p.id=r.property_id;
 if r.status='CHECKED_IN' then return; end if;
 if r.status<>'PENDING' or today<r.check_in_date or today>=r.check_out_date then raise exception 'Check-in is allowed only during the booked stay.'; end if;
 update public.stayman_reservations set status='CHECKED_IN' where id=r.id;
 update public.stayman_allocations set status='CHECKED_IN' where reservation_id=r.id;
end $$;

create function public.stayman_cancel(p_reservation uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status='CANCELLED' then return; end if;
 if r.status='CHECKED_OUT' then raise exception 'A completed stay cannot be cancelled.'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 250 then raise exception 'Enter a cancellation reason of 3 to 250 characters.'; end if;
 update public.stayman_reservations set status='CANCELLED',cancellation_reason=trim(p_reason),cancelled_at=now(),cancelled_by=auth.uid(),
 cancelled_allocations=(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.stayman_allocations a where reservation_id=r.id)
 where id=r.id;
 delete from public.stayman_allocations where reservation_id=r.id;
end $$;

create function public.stayman_refund(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; previous public.stayman_payments; result uuid; maximum bigint;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if p_request is null then raise exception 'Refund request ID required.'; end if;
 select * into previous from public.stayman_payments where request_id=p_request;
 if found then
  if previous.reservation_id<>p_reservation or previous.kind<>'REFUND' or previous.amount_paise is distinct from p_amount
   or previous.method is distinct from p_method or previous.note is distinct from coalesce(trim(p_note),'') then
   raise exception 'Payment request already used with different details.';
  end if;
  return previous.id;
 end if;
 maximum:=case when r.status='CANCELLED' then r.paid_amount else greatest(0,r.paid_amount-r.total_amount) end;
 if p_amount is null or p_amount<=0 or p_amount>maximum then raise exception 'Refund exceeds the refundable amount.'; end if;
 if p_method is null or p_method not in ('CASH','UPI','CARD','BANK') or length(coalesce(p_note,''))>250 then raise exception 'Invalid refund details.'; end if;
 insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,recorded_by,request_id,kind)
 values(r.property_id,r.id,p_amount,p_method,coalesce(trim(p_note),''),auth.uid(),p_request,'REFUND') returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount-p_amount where id=r.id;
 return result;
end $$;
revoke all on function public.stayman_transfer(uuid,uuid,date,date,bigint,bigint,uuid),public.stayman_check_in(uuid),
 public.stayman_cancel(uuid,text),public.stayman_refund(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.stayman_transfer(uuid,uuid,date,date,bigint,bigint,uuid),public.stayman_check_in(uuid),
 public.stayman_cancel(uuid,text),public.stayman_refund(uuid,bigint,text,text,uuid) to authenticated;
create or replace function public.stayman_record_payment(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; existing public.stayman_payments; result uuid;
begin
  select * into r from public.stayman_reservations where id=p_reservation for update;
  if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
  if p_request is null then raise exception 'Payment request ID required.'; end if;
  select * into existing from public.stayman_payments where request_id=p_request;
  if found then
    if existing.reservation_id<>p_reservation or existing.kind<>'RECEIPT' or existing.amount_paise is distinct from p_amount
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


notify pgrst,'reload schema';
commit;
