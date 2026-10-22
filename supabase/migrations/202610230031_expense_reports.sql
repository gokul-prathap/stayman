-- Expense workflow and payment ledger. Apply after 030; safe to rerun.
begin;
alter table public.stayman_expenses
 add column if not exists cost_kind text not null default 'OPERATING' check(cost_kind in ('OPERATING','EQUIPMENT','DEPOSIT','OWNER_CONTRIBUTION','OWNER_WITHDRAWAL')),
 add column if not exists paid_by text not null default 'PROPERTY' check(paid_by in ('PROPERTY','STAFF')),
 add column if not exists staff_name text not null default '' check(length(staff_name)<=100),
 add column if not exists receipt_path text,
 add column if not exists billing_from date,
 add column if not exists billing_to date,
 add column if not exists laundry_quantity numeric(12,2) check(laundry_quantity>0),
 add column if not exists laundry_unit text check(laundry_unit in ('PIECES','KG')),
 add column if not exists repeat_monthly boolean not null default false,
 add column if not exists repeat_source uuid references public.stayman_expenses(id),
 add column if not exists updated_at timestamptz not null default now();
create unique index if not exists stayman_expense_repeat_once on public.stayman_expenses(repeat_source,expense_date) where repeat_source is not null and voided_at is null;

create table if not exists public.stayman_expense_payments (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
 expense_id uuid not null references public.stayman_expenses(id),
 kind text not null check(kind in ('PAYMENT','REFUND','REIMBURSEMENT')),
 amount_paise bigint not null check(amount_paise between 1 and 10000000000),
 payment_date date not null, method text not null check(method in ('CASH','UPI','CARD','BANK')),
 source text not null check(source in ('PROPERTY','STAFF')),
 recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 request_id uuid not null unique, note text not null default '' check(length(note)<=250)
);
alter table public.stayman_expense_payments enable row level security;
revoke all on public.stayman_expense_payments from public,anon,authenticated;
grant select on public.stayman_expense_payments to authenticated;
drop policy if exists staff_read on public.stayman_expense_payments;
create policy staff_read on public.stayman_expense_payments for select to authenticated using(public.stayman_is_staff(property_id));
create index if not exists stayman_expense_payment_dates on public.stayman_expense_payments(property_id,payment_date);
create index if not exists stayman_expense_payment_bill on public.stayman_expense_payments(expense_id);
insert into public.stayman_expense_payments(property_id,expense_id,kind,amount_paise,payment_date,method,source,recorded_by,request_id)
select property_id,id,'PAYMENT',amount_paise,paid_date,method,'PROPERTY',recorded_by,id
from public.stayman_expenses e where paid_date is not null
and not exists(select 1 from public.stayman_expense_payments p where p.expense_id=e.id)
on conflict(request_id) do nothing;

-- Internal projection: payment dates, not today's paid flag, determine past balances.
create or replace function public.stayman_expense_balance(p_expense uuid,p_day date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('paid',coalesce(sum(amount_paise) filter(where kind='PAYMENT'),0),
 'refunded',coalesce(sum(amount_paise) filter(where kind='REFUND'),0),
 'staffOwed',greatest(0,coalesce(sum(case when source='STAFF' and kind='PAYMENT' then amount_paise when source='STAFF' and kind='REFUND' then -amount_paise when kind='REIMBURSEMENT' then -amount_paise else 0 end),0)))
 from public.stayman_expense_payments where expense_id=p_expense and payment_date<=p_day;
$$;
revoke all on function public.stayman_expense_balance(uuid,date) from public,anon,authenticated;

create or replace function public.stayman_expense_payment(p_expense uuid,p_kind text,p_amount bigint,p_day date,p_method text,p_source text,p_request uuid,p_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses; b jsonb; result uuid; today date;
begin
 select * into e from public.stayman_expenses where id=p_expense for update;
 if not found or not public.stayman_is_staff(e.property_id) then raise exception 'Staff access required.'; end if;
 if e.voided_at is not null then raise exception 'This entry was removed.'; end if;
 select id into result from public.stayman_expense_payments where request_id=p_request and expense_id=e.id;
 if found then return result; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=e.property_id;
 if p_request is null or p_amount is null or p_amount<=0 or p_day is null or p_day>today or p_day<e.expense_date
 or p_kind is null or p_kind not in ('PAYMENT','REFUND','REIMBURSEMENT') or p_source is null or p_source not in ('PROPERTY','STAFF')
 or p_method is null or p_method not in ('CASH','UPI','CARD','BANK') or length(coalesce(p_note,''))>250 then raise exception 'Enter a valid amount, payment date and method. Payment must be on or after the bill date.'; end if;
 if e.cost_kind in ('OWNER_CONTRIBUTION','OWNER_WITHDRAWAL') and (p_source<>'PROPERTY' or p_kind<>'PAYMENT') then raise exception 'Owner movements use property payments only.'; end if;
 if p_kind='REIMBURSEMENT' and p_source<>'PROPERTY' then raise exception 'Reimbursements are paid by the property.'; end if;
 if p_kind='PAYMENT' and p_source<>e.paid_by then raise exception 'Use the payer selected on this bill.'; end if;
 b:=public.stayman_expense_balance(e.id,today);
 if exists(select 1 from public.stayman_expense_payments where expense_id=e.id and payment_date>p_day) then raise exception 'Payment date must not precede an existing payment or refund. Ask the owner to correct an incorrect entry.'; end if;
 if p_kind='PAYMENT' and p_amount>e.amount_paise-(b->>'paid')::bigint then raise exception 'Payment exceeds the remaining bill amount.'; end if;
 if p_kind='REFUND' and (p_amount>(b->>'paid')::bigint-(b->>'refunded')::bigint or p_amount>(public.stayman_expense_balance(e.id,p_day)->>'paid')::bigint-(public.stayman_expense_balance(e.id,p_day)->>'refunded')::bigint) then raise exception 'Refund exceeds money paid as of this date.'; end if;
 if p_kind='REFUND' and p_source='STAFF' and p_amount>(public.stayman_expense_balance(e.id,p_day)->>'staffOwed')::bigint then raise exception 'Staff refund exceeds the unreimbursed amount.'; end if;
 if p_kind='REFUND' and p_source='PROPERTY' and p_amount>coalesce((select sum(case when kind='REFUND' then -amount_paise else amount_paise end) from public.stayman_expense_payments where expense_id=e.id and source='PROPERTY'),0) then raise exception 'Refund exceeds funds paid by the property. Select staff if the refund went to them.'; end if;
 if p_kind='REIMBURSEMENT' and (p_amount>(b->>'staffOwed')::bigint or p_amount>(public.stayman_expense_balance(e.id,p_day)->>'staffOwed')::bigint) then raise exception 'Reimbursement exceeds the staff balance on this date.'; end if;
 insert into public.stayman_expense_payments(property_id,expense_id,kind,amount_paise,payment_date,method,source,recorded_by,request_id,note)
 values(e.property_id,e.id,p_kind,p_amount,p_day,p_method,p_source,auth.uid(),p_request,coalesce(p_note,'')) returning id into result;
 b:=public.stayman_expense_balance(e.id,today);
 update public.stayman_expenses set paid_date=case when (b->>'paid')::bigint>=amount_paise then (select max(payment_date) from public.stayman_expense_payments where expense_id=e.id and kind='PAYMENT') end,
 method=case when (b->>'paid')::bigint>=amount_paise then p_method end,updated_at=now() where id=e.id;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor,note) values(e.property_id,e.id,p_kind,auth.uid(),p_amount::text||' '||p_day::text||' '||p_source);
 return result;
end $$;

create or replace function public.stayman_save_expense_v2(p_property uuid,p_details jsonb,p_request uuid,p_expense uuid default null,p_expected timestamptz default null,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses; result uuid; today date; bill_day date; amount bigint; kind text; payer text; initial bigint; receipt text;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or p_request is null then raise exception 'Complete the expense details.'; end if;
 if p_expense is null then select id into result from public.stayman_expenses where request_id=p_request and property_id=p_property; if found then return result; end if; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
 bill_day:=(p_details->>'expense_date')::date; amount:=(p_details->>'amount_paise')::bigint;
 kind:=coalesce(p_details->>'cost_kind','OPERATING'); payer:=coalesce(p_details->>'paid_by','PROPERTY');
 if kind<>'OPERATING' and not public.stayman_is_owner(p_property) then raise exception 'Only owners can record non-operating entries.'; end if;
 if bill_day is null or bill_day>today or amount is null or amount not between 1 and 10000000000 then raise exception 'Enter a valid amount and bill date.'; end if;
 if payer='STAFF' and length(trim(coalesce(p_details->>'staff_name','')))<2 then raise exception 'Enter the staff member to reimburse.'; end if;
 if kind in ('OWNER_CONTRIBUTION','OWNER_WITHDRAWAL') and payer<>'PROPERTY' then raise exception 'Owner movements must use property funds.'; end if;
 if (nullif(p_details->>'billing_from','') is null)<>(nullif(p_details->>'billing_to','') is null)
 or nullif(p_details->>'billing_to','')::date<nullif(p_details->>'billing_from','')::date then raise exception 'Enter both billing period dates in order.'; end if;
 if (nullif(p_details->>'laundry_quantity','') is null)<>(nullif(p_details->>'laundry_unit','') is null) then raise exception 'Choose both laundry quantity and unit.'; end if;
 if nullif(p_details->>'laundry_quantity','') is not null and p_details->>'category'<>'LAUNDRY' then raise exception 'Laundry quantity is only for laundry bills.'; end if;
 receipt:=nullif(p_details->>'receipt_path','');
 if receipt is not null and receipt !~ ('^'||p_property::text||'/[0-9a-f-]+\.(jpg|png|webp|pdf)$') then raise exception 'Invalid receipt path.'; end if;
 if receipt is not null and not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=receipt) then raise exception 'Receipt upload is missing. Upload the file again.'; end if;
 if nullif(p_details->>'repeat_source','') is not null and not exists(select 1 from public.stayman_expenses where id=(p_details->>'repeat_source')::uuid and property_id=p_property and repeat_monthly and voided_at is null) then raise exception 'Monthly bill source is unavailable for this property.'; end if;
 if p_expense is not null then
  select * into e from public.stayman_expenses where id=p_expense and property_id=p_property for update;
  if not found or e.voided_at is not null then raise exception 'Expense unavailable.'; end if;
  if e.cost_kind<>'OPERATING' and not public.stayman_is_owner(p_property) then raise exception 'Owner access required for non-operating entries.'; end if;
  if e.updated_at is distinct from p_expected then raise exception 'Expense changed. Refresh before editing.'; end if;
  if length(trim(coalesce(p_reason,''))) not between 2 and 250 then raise exception 'Enter a correction reason.'; end if;
  if exists(select 1 from public.stayman_expense_payments where expense_id=e.id) and
   (amount<>e.amount_paise or bill_day<>e.expense_date or kind<>e.cost_kind or payer<>e.paid_by or coalesce(p_details->>'staff_name','')<>e.staff_name)
   then raise exception 'Paid entries keep their amount, date, classification and payer. Record a supplier refund or ask the owner to remove an incorrect entry.'; end if;
  result:=e.id;
 else
  if not coalesce((p_details->>'allow_duplicate')::boolean,false) and exists(select 1 from public.stayman_expenses x where x.property_id=p_property and x.voided_at is null and x.expense_date=bill_day and x.amount_paise=amount and x.category=p_details->>'category' and lower(trim(x.vendor))=lower(trim(coalesce(p_details->>'vendor','')))) then raise exception 'Possible duplicate expense: same date, category, supplier and amount. Review the existing bill or confirm this is a separate purchase.'; end if;
  insert into public.stayman_expenses(property_id,category,description,amount_paise,expense_date,recorded_by,request_id)
  values(p_property,p_details->>'category',coalesce(nullif(trim(p_details->>'description'),''),initcap(p_details->>'category')),amount,bill_day,auth.uid(),p_request) returning id into result;
 end if;
 update public.stayman_expenses set category=p_details->>'category',description=coalesce(nullif(trim(p_details->>'description'),''),initcap(p_details->>'category')),
 vendor=coalesce(trim(p_details->>'vendor'),''),amount_paise=amount,expense_date=bill_day,due_date=nullif(p_details->>'due_date','')::date,
 units_consumed=case when p_details->>'category'='ELECTRICITY' then nullif(p_details->>'units_consumed','')::numeric end,
 cost_kind=kind,paid_by=payer,staff_name=coalesce(trim(p_details->>'staff_name'),''),receipt_path=receipt,
 billing_from=nullif(p_details->>'billing_from','')::date,billing_to=nullif(p_details->>'billing_to','')::date,
 laundry_quantity=nullif(p_details->>'laundry_quantity','')::numeric,laundry_unit=nullif(p_details->>'laundry_unit',''),
 repeat_monthly=coalesce((p_details->>'repeat_monthly')::boolean,false),repeat_source=nullif(p_details->>'repeat_source','')::uuid,updated_at=now() where id=result;
 if p_expense is null then
  initial:=coalesce(nullif(p_details->>'initial_payment','')::bigint,0);
  if initial<0 then raise exception 'Payment cannot be negative.'; end if;
  if initial>0 then perform public.stayman_expense_payment(result,'PAYMENT',initial,coalesce(nullif(p_details->>'paid_date','')::date,today),p_details->>'method',payer,p_request); end if;
 end if;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor,note) values(p_property,result,case when p_expense is null then 'CREATED' else 'EDITED' end,auth.uid(),coalesce(p_reason,''));
 if p_expense is not null then insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor) values(p_property,result,'EDIT_EXPENSE',to_jsonb(e),(select to_jsonb(x) from public.stayman_expenses x where id=result),auth.uid()); end if;
 return result;
end $$;

-- Keep old clients compatible, while routing their payments into the ledger.
create or replace function public.stayman_add_expense(p_property uuid,p_details jsonb,p_request uuid)
returns uuid language sql security definer set search_path='' as $$
 select public.stayman_save_expense_v2(p_property,p_details||jsonb_build_object('initial_payment',case when nullif(p_details->>'paid_date','') is null then 0 else (p_details->>'amount_paise')::bigint end),p_request);
$$;
create or replace function public.stayman_pay_expense(p_expense uuid,p_day date,p_method text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses; b jsonb;
begin
 select * into e from public.stayman_expenses where id=p_expense;
 if not found or not public.stayman_is_staff(e.property_id) then raise exception 'Staff access required.'; end if;
 b:=public.stayman_expense_balance(e.id,'9999-12-31');
 perform public.stayman_expense_payment(e.id,'PAYMENT',e.amount_paise-(b->>'paid')::bigint,p_day,p_method,e.paid_by,gen_random_uuid());
end $$;
create or replace function public.stayman_edit_expense(p_expense uuid,p_details jsonb,p_expected jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.stayman_save_expense_v2((select property_id from public.stayman_expenses where id=p_expense),p_details,gen_random_uuid(),p_expense,(p_expected->>'updated_at')::timestamptz,p_reason);
end $$;

-- Bound list/search/export pages, with a separate outstanding-at-date filter.
create or replace function public.stayman_expense_list(p_property uuid,p_from date,p_to date,p_page integer default 1,p_search text default '',p_category text default '',p_status text default 'all',p_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_page is null or p_page<1 or p_page>100000 or p_size is null or p_size not between 1 and 100 or length(coalesce(p_search,''))>100 or p_status is null or p_status not in ('all','unpaid','overdue','staff','missing_receipt') then raise exception 'Invalid expense filters.'; end if;
 with bills as (
  select to_jsonb(e)||jsonb_build_object('balance',b.data) as data,e.expense_date,e.created_at,e.id
  from public.stayman_expenses e cross join lateral (select public.stayman_expense_balance(e.id,p_to) as data) b
  where e.property_id=p_property and (p_category='' or e.category=p_category)
   and (p_search='' or e.description ilike '%'||p_search||'%' or e.vendor ilike '%'||p_search||'%' or e.staff_name ilike '%'||p_search||'%')
   and case when p_status in ('unpaid','overdue','staff') then e.expense_date<=p_to else e.expense_date between p_from and p_to end
   and (p_status='all' or (e.voided_at is null and case p_status
     when 'unpaid' then e.amount_paise>(b.data->>'paid')::bigint
     when 'overdue' then e.amount_paise>(b.data->>'paid')::bigint and e.due_date<p_to
     when 'staff' then (b.data->>'staffOwed')::bigint>0
     when 'missing_receipt' then e.receipt_path is null else false end))
 ) select jsonb_build_object('total',(select count(*) from bills),'isOwner',public.stayman_is_owner(p_property),'expenses',coalesce((select jsonb_agg(data order by expense_date desc,created_at desc,id) from (select * from bills order by expense_date desc,created_at desc,id limit p_size offset (p_page-1)*p_size) x),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.stayman_expense_history(p_expense uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.stayman_expenses;
begin
 select * into e from public.stayman_expenses where id=p_expense;
 if not found or not public.stayman_is_staff(e.property_id) then raise exception 'Staff access required.'; end if;
 return jsonb_build_object('expense',to_jsonb(e)||jsonb_build_object('balance',public.stayman_expense_balance(e.id,'9999-12-31')),'payments',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('actor_label',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Staff member')) order by payment_date,x.created_at) from public.stayman_expense_payments x left join auth.users u on u.id=x.recorded_by where expense_id=e.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('actor_label',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Staff member')) order by x.created_at) from public.stayman_expense_events x left join auth.users u on u.id=x.actor where expense_id=e.id),'[]'::jsonb));
end $$;

-- Internal daily financial projection. No guest identities are returned.
create or replace function public.stayman_finance_days(p_property uuid,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 with days as (select d::date as day from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d),
 expenses as (select * from public.stayman_expenses where property_id=p_property and voided_at is null),
 payments as (select p.*,e.cost_kind from public.stayman_expense_payments p join expenses e on e.id=p.expense_id),
 earned as (
  select d.day,case when count(a.id)>0 and count(a.id)=count(a.charge_paise) then coalesce(sum(trunc(a.charge_paise::numeric*(d.day-a.check_in_date+1)/nullif(a.check_out_date-a.check_in_date,0))-trunc(a.charge_paise::numeric*(d.day-a.check_in_date)/nullif(a.check_out_date-a.check_in_date,0))),0)
  else coalesce((select sum(r.total_amount::numeric/nullif(r.check_out_date-r.check_in_date,0)) from public.stayman_reservations r where r.property_id=p_property and r.status<>'CANCELLED' and r.check_in_date<=d.day and r.check_out_date>d.day),0) end as revenue,
  count(distinct a.unit_id) as occupied
  from days d left join (public.stayman_allocations a join public.stayman_reservations r on r.id=a.reservation_id and r.status<>'CANCELLED') on a.property_id=p_property and a.status<>'MAINTENANCE' and a.check_in_date<=d.day and a.check_out_date>d.day group by d.day
 ), cash as (
  select (paid_at at time zone (select timezone from public.stayman_properties where id=p_property))::date as day,sum(case when kind='REFUND' then -amount_paise else amount_paise end) as receipts
 from (select paid_at,amount_paise,kind from public.stayman_payments where property_id=p_property and method<>'OPENING'
 union all select paid_at,amount,'RECEIPT' from public.stayman_folio_payments where property_id=p_property) guest_cash group by 1
 ) select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'revenue',r.revenue,'occupied',r.occupied,'receipts',coalesce(c.receipts,0),
 'cost',coalesce((select sum(amount_paise) from expenses where expense_date=d.day and cost_kind='OPERATING'),0)-coalesce((select sum(amount_paise) from payments where payment_date=d.day and kind='REFUND' and cost_kind='OPERATING'),0),
 'paid',coalesce((select sum(case when kind='REFUND' then -amount_paise else amount_paise end) from payments where payment_date=d.day and source='PROPERTY' and cost_kind='OPERATING'),0),
 'propertyOut',coalesce((select sum(case when cost_kind='OWNER_CONTRIBUTION' or kind='REFUND' then -amount_paise else amount_paise end) from payments where payment_date=d.day and source='PROPERTY'),0)) order by d.day),'[]'::jsonb)
 from days d join earned r using(day) left join cash c using(day);
$$;
revoke all on function public.stayman_finance_days(uuid,date,date) from public,anon,authenticated;

create or replace function public.stayman_finance_report(p_property uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required for financial reports.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>732 then raise exception 'Choose up to 733 days.'; end if;
 select jsonb_build_object('days',public.stayman_finance_days(p_property,p_from,p_to),
 'categories',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select expense_date as day,category,cost_kind,count(*) as bills,sum(amount_paise) as amount,sum(units_consumed) as kwh,
  sum(case when units_consumed is not null and billing_from is not null then units_consumed end) as period_kwh,
  sum(case when units_consumed is not null then billing_to-billing_from+1 end) as billing_days,
  count(*) filter(where receipt_path is null) as missing_receipts,
  count(*) filter(where category='ELECTRICITY' and units_consumed is null) as missing_units,
  count(*) filter(where category='ELECTRICITY' and (billing_from is null or units_consumed is null)) as missing_period,
  sum(laundry_quantity) filter(where laundry_unit='PIECES') as pieces,sum(amount_paise) filter(where laundry_unit='PIECES') as pieces_cost,
  sum(laundry_quantity) filter(where laundry_unit='KG') as kg,sum(amount_paise) filter(where laundry_unit='KG') as kg_cost
  from public.stayman_expenses where property_id=p_property and voided_at is null and expense_date between p_from and p_to group by expense_date,category,cost_kind
 ) x),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('day',p.payment_date,'category',e.category,'cost_kind',e.cost_kind,'amount',p.amount_paise)) from public.stayman_expense_payments p join public.stayman_expenses e on e.id=p.expense_id where p.property_id=p_property and e.voided_at is null and p.kind='REFUND' and p.payment_date between p_from and p_to),'[]'::jsonb),
 'outstanding',coalesce((select sum(greatest(0,e.amount_paise-(public.stayman_expense_balance(e.id,p_to)->>'paid')::bigint)) from public.stayman_expenses e where property_id=p_property and voided_at is null and expense_date<=p_to),0),
 'staffOwed',coalesce((select sum((public.stayman_expense_balance(e.id,p_to)->>'staffOwed')::bigint) from public.stayman_expenses e where property_id=p_property and voided_at is null and expense_date<=p_to),0),
 'overdue',coalesce((select sum(greatest(0,e.amount_paise-(public.stayman_expense_balance(e.id,p_to)->>'paid')::bigint)) from public.stayman_expenses e where property_id=p_property and voided_at is null and due_date<p_to and expense_date<=p_to),0),
 'missingReceipts',(select count(*) from public.stayman_expenses where property_id=p_property and voided_at is null and receipt_path is null and expense_date between p_from and p_to),
 'recurring',coalesce((select jsonb_agg(to_jsonb(e)) from (select e.* from public.stayman_expenses e where e.property_id=p_property and e.voided_at is null and e.repeat_monthly and not exists(select 1 from public.stayman_expenses n where n.repeat_source=e.id and n.voided_at is null) order by expense_date desc limit 50) e),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- Private receipts: lazy signed URLs, property membership on every operation.
create or replace function public.stayman_expense_totals(p_property uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'Choose up to 366 days.'; end if;
 return (with e as (select * from public.stayman_expenses where property_id=p_property and voided_at is null),
 p as (select p.* from public.stayman_expense_payments p join e on e.id=p.expense_id where e.cost_kind='OPERATING')
 select jsonb_build_object('incurred',coalesce((select sum(amount_paise) from e where cost_kind='OPERATING' and expense_date between p_from and p_to),0)-coalesce((select sum(amount_paise) from p where kind='REFUND' and payment_date between p_from and p_to),0),
 'paid',coalesce((select sum(case when kind='REFUND' then -amount_paise else amount_paise end) from p where source='PROPERTY' and payment_date between p_from and p_to),0),
 'unpaid',coalesce((select sum(greatest(0,amount_paise-(public.stayman_expense_balance(id,p_to)->>'paid')::bigint)) from e where expense_date<=p_to),0),
 'staffOwed',coalesce((select sum((public.stayman_expense_balance(id,p_to)->>'staffOwed')::bigint) from e where expense_date<=p_to),0),
 'overdue',coalesce((select sum(greatest(0,amount_paise-(public.stayman_expense_balance(id,p_to)->>'paid')::bigint)) from e where expense_date<=p_to and due_date<p_to),0),
 'units',coalesce((select sum(units_consumed) from e where cost_kind='OPERATING' and category='ELECTRICITY' and expense_date between p_from and p_to),0)));
end $$;
revoke all on function public.stayman_expense_totals(uuid,date,date) from public,anon;
grant execute on function public.stayman_expense_totals(uuid,date,date) to authenticated;

-- Preserve the bounded workspace implementation, updating only dashboard costs.
do $$ begin
 if to_regprocedure('public.stayman_workspace_data_v30(uuid,text,date,date,uuid,integer,integer,text,text)') is null then
  alter function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text) rename to stayman_workspace_data_v30;
 end if;
end $$;
create or replace function public.stayman_workspace_data(p_property uuid,p_mode text default 'window',p_from date default current_date,p_to date default current_date+30,p_reservation uuid default null,p_page integer default 1,p_size integer default 25,p_search text default '',p_filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date;
begin
 result:=public.stayman_workspace_data_v30(p_property,p_mode,p_from,p_to,p_reservation,p_page,p_size,p_search,p_filter);
 if p_mode='dashboard' then
  select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
  result:=jsonb_set(result,'{operations,costs}',public.stayman_expense_totals(p_property,today-6,today));
 end if;
 return result;
end $$;
revoke all on function public.stayman_workspace_data_v30(uuid,text,date,date,uuid,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text) from public,anon;
grant execute on function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-receipts','expense-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists expense_receipt_read on storage.objects;
drop policy if exists expense_receipt_insert on storage.objects;
drop policy if exists expense_receipt_delete on storage.objects;
create policy expense_receipt_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and exists(select 1 from public.stayman_properties p where p.id::text=(storage.foldername(objects.name))[1] and public.stayman_is_staff(p.id)));
create policy expense_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='expense-receipts' and exists(select 1 from public.stayman_properties p where p.id::text=(storage.foldername(objects.name))[1] and public.stayman_is_staff(p.id)));
create policy expense_receipt_delete on storage.objects for delete to authenticated using(bucket_id='expense-receipts' and exists(select 1 from public.stayman_properties p where p.id::text=(storage.foldername(objects.name))[1] and public.stayman_is_staff(p.id)) and not exists(select 1 from public.stayman_expenses e where e.receipt_path=objects.name));

revoke all on function public.stayman_save_expense_v2(uuid,jsonb,uuid,uuid,timestamptz,text),public.stayman_expense_payment(uuid,text,bigint,date,text,text,uuid,text),public.stayman_expense_list(uuid,date,date,integer,text,text,text,integer),public.stayman_expense_history(uuid),public.stayman_finance_report(uuid,date,date) from public,anon;
grant execute on function public.stayman_save_expense_v2(uuid,jsonb,uuid,uuid,timestamptz,text),public.stayman_expense_payment(uuid,text,bigint,date,text,text,uuid,text),public.stayman_expense_list(uuid,date,date,integer,text,text,text,integer),public.stayman_expense_history(uuid),public.stayman_finance_report(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
