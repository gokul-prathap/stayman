-- Apply after migrations through 038. Review docs/DEPLOYMENT.md first.

-- 202610230039_booking_policies.sql
-- Booking policies, audited closure settlement and historical status corrections.
-- No-show uses terminal CANCELLED inventory semantics plus closure_kind='NO_SHOW'.
begin;
create table if not exists public.stayman_booking_policies(
 property_id uuid primary key references public.stayman_properties(id),
 policy jsonb not null,version bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
alter table public.stayman_booking_policies enable row level security;
revoke all on public.stayman_booking_policies from public,anon,authenticated;
alter table public.stayman_reservations add column if not exists policy_snapshot jsonb;
alter table public.stayman_reservations add column if not exists closure_kind text check(closure_kind in ('CANCELLATION','NO_SHOW'));
alter table public.stayman_reservations add column if not exists closure_fee bigint not null default 0 check(closure_fee>=0);
alter table public.stayman_reservations add column if not exists closure_at timestamptz;
alter table public.stayman_reservations add column if not exists closure_notice_at timestamptz;
alter table public.stayman_reservations add column if not exists closure_money_handler text not null default 'PROPERTY' check(closure_money_handler in ('PROPERTY','EXTERNAL'));

create or replace function public.stayman_booking_policy(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 return jsonb_build_object('can_edit',public.stayman_is_owner(p_property),'version',coalesce((select version from public.stayman_booking_policies where property_id=p_property),0),
  'policy',(select policy from public.stayman_booking_policies where property_id=p_property));
end $$;
create or replace function public.stayman_save_booking_policy(p_property uuid,p_policy jsonb,p_version bigint) returns void
language plpgsql security definer set search_path='' as $$
declare rule jsonb; current_version bigint;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 perform 1 from public.stayman_properties where id=p_property for update;
 select coalesce((select version from public.stayman_booking_policies where property_id=p_property),0) into current_version;
 if p_version is distinct from current_version then raise exception 'Policy changed. Refresh and review again.'; end if;
 if p_policy is null or jsonb_typeof(p_policy)<>'object' or coalesce(length(trim(p_policy->>'name')),0) not between 2 and 100
  or coalesce(p_policy->>'free_hours','') !~ '^\d{1,4}$' or (p_policy->>'free_hours')::integer>8760 then raise exception 'Enter a policy name and free-cancellation hours (0–8760).'; end if;
 foreach rule in array array[p_policy->'cancellation',p_policy->'no_show'] loop
  if rule is null or coalesce(rule->>'type','') not in ('NONE','FIXED','PERCENT','FIRST_NIGHT','FULL')
   or coalesce(rule->>'value','') !~ '^\d{1,12}$' or (rule->>'value')::bigint>100000000
   or (rule->>'type'='PERCENT' and (rule->>'value')::bigint>10000) then raise exception 'Enter valid fee rules. Percentages cannot exceed 100%%.'; end if;
 end loop;
 insert into public.stayman_booking_policies(property_id,policy,updated_by) values(p_property,p_policy,auth.uid())
 on conflict(property_id) do update set policy=excluded.policy,version=stayman_booking_policies.version+1,updated_at=now(),updated_by=auth.uid();
 insert into public.stayman_staff_actions(property_id,entity_id,action,after_details,actor)
 values(p_property,p_property,'BOOKING_POLICY_UPDATED',jsonb_build_object('policy',p_policy,'version',current_version+1),auth.uid());
end $$;
create or replace function public.stayman_capture_booking_policy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A property default applies only to direct bookings, never an imported OTA rate plan.
 if coalesce(new.source,'Direct Booking')='Direct Booking' then
  select jsonb_build_object('policy',policy,'version',version,'saved_at',now()) into new.policy_snapshot from public.stayman_booking_policies where property_id=new.property_id;
 else new.policy_snapshot:=null; end if;
 return new;
end $$;
create or replace trigger stayman_capture_booking_policy before insert on public.stayman_reservations for each row execute function public.stayman_capture_booking_policy();
revoke all on function public.stayman_capture_booking_policy() from public,anon,authenticated;

create or replace function public.stayman_closure_quote(p_reservation uuid,p_kind text,p_notice timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; p public.stayman_properties; rule jsonb; policy jsonb; fee bigint; first_night bigint; notice timestamptz:=coalesce(p_notice,now()); deadline timestamptz; extra_paid bigint;
begin
 select * into r from public.stayman_reservations where id=p_reservation;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if p_kind not in ('CANCELLATION','NO_SHOW') or p_kind is null then raise exception 'Choose cancellation or no-show.'; end if;
 if r.status='CHECKED_IN' then raise exception 'Guest is already checked in. Use checkout, not cancellation or no-show.'; end if;
 if r.status='CHECKED_OUT' then raise exception 'A completed stay cannot be marked cancelled or no-show.'; end if;
 if r.status='CANCELLED' and r.closure_kind is not null and r.closure_kind is distinct from p_kind then raise exception 'This booking is already closed with a different outcome.'; end if;
 select * into p from public.stayman_properties where id=r.property_id;
 if p_kind='NO_SHOW' and r.status<>'CANCELLED' and (r.status<>'PENDING' or now()<((r.check_in_date+coalesce(p.check_in_time,'14:00'::time)) at time zone p.timezone)) then raise exception 'Only an awaiting-arrival booking after its check-in time can be marked no-show. Guests who arrived require checkout.'; end if;
 if notice>now()+interval '1 minute' or notice<r.created_at then raise exception 'Notification time must be between booking creation and now.'; end if;
 if notice<now()-interval '15 minutes' and not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required to backdate guest notification time.'; end if;
 if exists(select 1 from public.stayman_folios where reservation_id=r.id and status='ISSUED') then raise exception 'An issued invoice exists. Resolve the billing correction before closing this booking.'; end if;
 select coalesce(sum(fp.amount-coalesce((to_jsonb(fp)->>'accommodation_applied')::bigint,0)),0) into extra_paid
 from public.stayman_folio_payments fp join public.stayman_folios f on f.id=fp.folio_id where f.reservation_id=r.id;
 if extra_paid>0 or exists(select 1 from public.stayman_folio_charges c join public.stayman_folios f on f.id=c.folio_id where f.reservation_id=r.id and c.voided_at is null) then
  raise exception 'This booking has extra folio charges or receipts. Reconcile them before cancellation/no-show settlement.';
 end if;
 policy:=r.policy_snapshot->'policy';rule:=policy->case when p_kind='NO_SHOW' then 'no_show' else 'cancellation' end;
 deadline:=((r.check_in_date+coalesce(p.check_in_time,'14:00'::time)) at time zone p.timezone)-make_interval(hours=>coalesce((policy->>'free_hours')::integer,0));
 select coalesce(sum(a.charge_paise/greatest(1,a.check_out_date-a.check_in_date)),r.total_amount/greatest(1,r.check_out_date-r.check_in_date)) into first_night
 from public.stayman_allocations a where a.reservation_id=r.id and a.check_in_date<=r.check_in_date and a.check_out_date>r.check_in_date;
 if r.status='CANCELLED' then select coalesce(sum((a->>'charge_paise')::bigint/greatest(1,(a->>'check_out_date')::date-(a->>'check_in_date')::date)),first_night) into first_night from jsonb_array_elements(coalesce(r.cancelled_allocations,'[]')) a where (a->>'check_in_date')::date<=r.check_in_date and (a->>'check_out_date')::date>r.check_in_date; end if;
 fee:=case when policy is null then null when p_kind='CANCELLATION' and notice<=deadline then 0
  when rule->>'type'='NONE' then 0 when rule->>'type'='FIXED' then (rule->>'value')::bigint
  when rule->>'type'='PERCENT' then round(r.total_amount::numeric*(rule->>'value')::numeric/10000)::bigint
  when rule->>'type'='FIRST_NIGHT' then first_night when rule->>'type'='FULL' then r.total_amount end;
 fee:=least(r.total_amount,greatest(0,fee));
 if policy is null then fee:=null; end if;
 return jsonb_build_object('reservation_id',r.id,'status',r.status,'kind',p_kind,'total',r.total_amount,'received',r.paid_amount,
  'arrival',r.check_in_date,'departure',r.check_out_date,'notice',notice,'deadline',deadline,'policy',r.policy_snapshot,'fee',fee,
  'current_fee',r.closure_fee,'owner',public.stayman_is_owner(r.property_id),'closed',r.status='CANCELLED',
  'group_size',(select count(*) from public.stayman_booking_members where reservation_id=r.id),
  'channel_booking',exists(select 1 from public.stayman_aiosell_bookings where reservation_id=r.id));
end $$;

create or replace function public.stayman_close_booking(p_reservation uuid,p_kind text,p_notice timestamptz,p_fee bigint,p_handler text,p_reason text,p_none_arrived boolean,p_expected jsonb,p_request uuid,p_external_review boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; quote jsonb; previous public.stayman_staff_actions;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if p_request is null then raise exception 'Request ID required.'; end if;
 select * into previous from public.stayman_staff_actions where request_id=p_request;
 if found then
  if previous.entity_id<>r.id or previous.after_details->>'kind' is distinct from p_kind or (previous.after_details->>'fee')::bigint is distinct from p_fee
   or previous.after_details->>'handler' is distinct from p_handler or previous.after_details->>'reason' is distinct from trim(p_reason) then raise exception 'Request already used with different details.'; end if;
  return;
 end if;
 quote:=public.stayman_closure_quote(r.id,p_kind,p_notice);
 if quote is distinct from p_expected then raise exception 'Booking or settlement changed. Refresh the quote and review again.'; end if;
 if p_kind='NO_SHOW' and p_none_arrived is distinct from true then raise exception 'Confirm that none of the guests arrived. Partial group no-shows require separate allocations/bookings.'; end if;
 if p_kind='NO_SHOW' and exists(select 1 from public.stayman_booking_members where reservation_id=r.id and checked_out_at is not null) then raise exception 'A guest has already checked out; this cannot be a whole-booking no-show.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 500 or p_handler not in ('PROPERTY','EXTERNAL') or p_handler is null then raise exception 'Enter a reason and choose who handles settlement.'; end if;
 if p_handler='EXTERNAL' and not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required to assign external settlement handling.'; end if;
 if p_fee is null or p_fee<0 or p_fee>r.total_amount then raise exception 'Fee must be between zero and the booking total.'; end if;
 if ((quote->>'fee') is null or p_fee is distinct from (quote->>'fee')::bigint or r.status='CANCELLED') and not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required for a missing policy, fee exception or closed-booking correction.'; end if;
 if (quote->>'channel_booking')::boolean and not public.stayman_is_owner(r.property_id) then raise exception 'Owner review required for the OTA booking policy and payment handler.'; end if;
 if (quote->>'channel_booking')::boolean and p_external_review is distinct from true then raise exception 'Confirm the provider policy and any external fee waiver/refund before closing this OTA booking.'; end if;
 update public.stayman_reservations set status='CANCELLED',closure_kind=p_kind,closure_fee=p_fee,closure_at=coalesce(closure_at,now()),closure_notice_at=p_notice,
  closure_money_handler=p_handler,cancellation_reason=left(trim(p_reason),250),cancelled_at=coalesce(cancelled_at,now()),cancelled_by=auth.uid(),
  cancelled_allocations=case when r.status='CANCELLED' then cancelled_allocations else (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.stayman_allocations a where reservation_id=r.id) end where id=r.id;
 delete from public.stayman_allocations where reservation_id=r.id;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor,request_id)
 values(r.property_id,r.id,'BOOKING_SETTLEMENT',to_jsonb(r),jsonb_build_object('kind',p_kind,'fee',p_fee,'handler',p_handler,'reason',trim(p_reason),'external_terms_confirmed',p_external_review,'quote',quote),auth.uid(),p_request);
end $$;

-- Old clients must not bypass the reviewed policy/fee calculation.
create or replace function public.stayman_cancel(p_reservation uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin raise exception 'Refresh Stayman and review cancellation/no-show settlement before confirming.'; end $$;

create or replace function public.stayman_correct_stay_status(p_reservation uuid,p_action text,p_reason text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; today date;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required for historical status corrections.'; end if;
 if r.status is distinct from p_expected then raise exception 'Booking changed. Refresh before correcting its status.'; end if;
 if r.status<>'PENDING' or p_action not in ('ARRIVED','PAST_STAY') or p_action is null or coalesce(length(trim(p_reason)),0) not between 3 and 500 then raise exception 'Choose a pending booking, correction and reason.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=r.property_id;
 if today<r.check_in_date or (p_action='ARRIVED' and today>=r.check_out_date) or (p_action='PAST_STAY' and today<r.check_out_date) then raise exception 'Choose the correction matching the booked stay dates.'; end if;
 if exists(select 1 from public.stayman_folios where reservation_id=r.id and status='ISSUED') then raise exception 'Issued invoice exists; resolve billing before correcting status.'; end if;
 if exists(select 1 from generate_series(r.check_in_date::timestamp,(r.check_out_date-1)::timestamp,interval '1 day') d where not exists(select 1 from public.stayman_allocations a where a.reservation_id=r.id and a.check_in_date<=d::date and a.check_out_date>d::date)) then raise exception 'Original allocations do not cover every booked night. Review booking history first.'; end if;
 if not exists(select 1 from public.stayman_allocations where reservation_id=r.id) then raise exception 'Original room allocations are missing. Review availability and booking history first.'; end if;
 if exists(select 1 from public.stayman_allocations a join public.stayman_allocations b on b.unit_id=a.unit_id and b.reservation_id is distinct from r.id and daterange(a.check_in_date,a.check_out_date,'[)')&&daterange(b.check_in_date,b.check_out_date,'[)') where a.reservation_id=r.id) then raise exception 'Conflicting allocation found. Resolve room history before recording a past stay.'; end if;
 update public.stayman_reservations set status='CHECKED_IN' where id=r.id;
 update public.stayman_allocations set status='CHECKED_IN' where reservation_id=r.id;
 if p_action='PAST_STAY' then perform public.stayman_checkout_guests(r.id,'{}'::uuid[],true); end if;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor)
 values(r.property_id,r.id,'STAY_STATUS_CORRECTED',to_jsonb(r),jsonb_build_object('action',p_action,'reason',trim(p_reason),'recorded_at',now()),auth.uid());
end $$;

revoke all on function public.stayman_booking_policy(uuid),public.stayman_save_booking_policy(uuid,jsonb,bigint),public.stayman_closure_quote(uuid,text,timestamptz),public.stayman_close_booking(uuid,text,timestamptz,bigint,text,text,boolean,jsonb,uuid,boolean),public.stayman_correct_stay_status(uuid,text,text,text) from public,anon;
grant execute on function public.stayman_booking_policy(uuid),public.stayman_save_booking_policy(uuid,jsonb,bigint),public.stayman_closure_quote(uuid,text,timestamptz),public.stayman_close_booking(uuid,text,timestamptz,bigint,text,text,boolean,jsonb,uuid,boolean),public.stayman_correct_stay_status(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;


-- 202610230040_settlement_reporting.sql
begin;
-- Older installations omitted this redundant link. Recover it from the owning folio.
alter table public.stayman_folio_payments add column if not exists reservation_id uuid references public.stayman_reservations(id);
update public.stayman_folio_payments p set reservation_id=f.reservation_id
from public.stayman_folios f where f.id=p.folio_id and p.reservation_id is null;
do $$ begin
 if exists(select 1 from public.stayman_folio_payments p left join public.stayman_folios f on f.id=p.folio_id
 where f.id is null or p.reservation_id is distinct from f.reservation_id) then
  raise exception 'Folio payment reservation links need reconciliation before continuing.';
 end if;
end $$;
alter table public.stayman_folio_payments alter column reservation_id set not null;
create or replace function public.stayman_refund(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid)
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
 if r.status='CANCELLED' and r.closure_money_handler='EXTERNAL' then raise exception 'Refund is handled externally. Record confirmation in the settlement history; do not record a property cash refund.'; end if;
 maximum:=case when r.status='CANCELLED' then greatest(0,r.paid_amount-r.closure_fee) else greatest(0,r.paid_amount-r.total_amount) end;
 if p_amount is null or p_amount<=0 or p_amount>maximum then raise exception 'Refund exceeds the refundable amount.'; end if;
 if p_method is null or p_method not in ('CASH','UPI','CARD','BANK') or length(coalesce(p_note,''))>250 then raise exception 'Invalid refund details.'; end if;
 insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,recorded_by,request_id,kind)
 values(r.property_id,r.id,p_amount,p_method,coalesce(trim(p_note),''),auth.uid(),p_request,'REFUND') returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount-p_amount where id=r.id;
 return result;
end $$;
-- Preserve the existing issued-folio payment path; add collection of a reviewed closure fee.
do $$ begin
 if to_regprocedure('public.stayman_record_payment_pre_closure(uuid,bigint,text,text,uuid)') is null then
  alter function public.stayman_record_payment(uuid,bigint,text,text,uuid) rename to stayman_record_payment_pre_closure;
 end if;
end $$;
revoke all on function public.stayman_record_payment_pre_closure(uuid,bigint,text,text,uuid) from public,anon,authenticated;
create or replace function public.stayman_record_payment(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; previous public.stayman_payments; result uuid;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status<>'CANCELLED' then return public.stayman_record_payment_pre_closure(p_reservation,p_amount,p_method,p_note,p_request); end if;
 if r.closure_kind is null or r.closure_money_handler<>'PROPERTY' then raise exception 'No property-collected closure fee is due.'; end if;
 if p_request is null then raise exception 'Payment request required.'; end if;
 select * into previous from public.stayman_payments where request_id=p_request;
 if found then
  if previous.reservation_id<>r.id or previous.kind<>'RECEIPT' or previous.amount_paise is distinct from p_amount or previous.method is distinct from p_method or previous.note is distinct from coalesce(trim(p_note),'') then raise exception 'Payment request already used with different details.'; end if;
  return previous.id;
 end if;
 if p_amount is null or p_amount<=0 or p_amount>r.closure_fee-r.paid_amount or p_method is null or p_method not in ('CASH','UPI','CARD','BANK') or length(coalesce(p_note,''))>250 then raise exception 'Payment must not exceed the outstanding closure fee.'; end if;
 insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,recorded_by,request_id,kind)
 values(r.property_id,r.id,p_amount,p_method,coalesce(trim(p_note),''),auth.uid(),p_request,'RECEIPT') returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount+p_amount where id=r.id;
 return result;
end $$;

create or replace function public.stayman_settlement_history(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.stayman_reservations;
begin
 select * into r from public.stayman_reservations where id=p_reservation;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.action,a.created_at,
  coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1),'Staff') as actor_name,
  a.after_details->>'reason' as reason,a.after_details->>'kind' as kind,a.after_details->'fee' as fee,a.after_details->>'reference' as reference
  from public.stayman_staff_actions a left join auth.users u on u.id=a.actor where a.property_id=r.property_id and a.entity_id=r.id and a.action in ('BOOKING_SETTLEMENT','STAY_STATUS_CORRECTED','EXTERNAL_SETTLEMENT','NO_SHOW_REVERSED','NO_SHOW_SYNC_CONFIRMED') order by a.created_at desc,a.id limit 30) x),'[]');
end $$;
create or replace function public.stayman_external_settlement(p_reservation uuid,p_reference text,p_note text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required.'; end if;
 if r.status<>'CANCELLED' or r.closure_money_handler<>'EXTERNAL' or p_request is null or coalesce(length(trim(p_reference)),0) not between 2 and 200 or coalesce(length(trim(p_note)),0) not between 3 and 500 then raise exception 'Enter an external confirmation reference and note for a closed, externally handled booking.'; end if;
 if exists(select 1 from public.stayman_staff_actions where request_id=p_request and entity_id=r.id and after_details=jsonb_build_object('reference',trim(p_reference),'reason',trim(p_note))) then return; end if;
 insert into public.stayman_staff_actions(property_id,entity_id,action,after_details,actor,request_id) values(r.property_id,r.id,'EXTERNAL_SETTLEMENT',jsonb_build_object('reference',trim(p_reference),'reason',trim(p_note)),auth.uid(),p_request);
end $$;

-- Include fees separately from accommodation revenue without unbounded guest history.
do $$ begin
 if to_regprocedure('public.stayman_workspace_data_pre_closure(uuid,text,date,date,uuid,integer,integer,text,text)') is null then
  alter function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text) rename to stayman_workspace_data_pre_closure;
 end if;
 if to_regprocedure('public.stayman_finance_report_pre_closure(uuid,date,date)') is null then
  alter function public.stayman_finance_report(uuid,date,date) rename to stayman_finance_report_pre_closure;
 end if;
 if to_regprocedure('public.stayman_guest_directory_pre_closure(uuid,text,text,text,integer,integer,date,date,text)') is null then
  alter function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) rename to stayman_guest_directory_pre_closure;
 end if;
end $$;
create or replace function public.stayman_workspace_data(p_property uuid,p_mode text default 'window',p_from date default current_date,p_to date default current_date+30,p_reservation uuid default null,p_page integer default 1,p_size integer default 25,p_search text default '',p_filter text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.stayman_workspace_data_pre_closure(p_property,p_mode,p_from,p_to,p_reservation,p_page,p_size,p_search,p_filter);
 if p_mode='dashboard' then result:=result||jsonb_build_object('pendingRefund',(select coalesce(sum(case when status='CANCELLED' then case when closure_money_handler='PROPERTY' then greatest(0,paid_amount-closure_fee) else 0 end else greatest(0,paid_amount-total_amount) end),0) from public.stayman_reservations where property_id=p_property)); end if;
 return result||jsonb_build_object('can_edit_guests',public.stayman_is_owner(p_property),'closureFees',coalesce((select jsonb_agg(to_jsonb(x)) from (select (r.closure_at at time zone p.timezone)::date as day,r.closure_kind as kind,sum(r.closure_fee) as amount from public.stayman_reservations r join public.stayman_properties p on p.id=r.property_id where r.property_id=p_property and (r.closure_at at time zone p.timezone)::date between p_from and p_to group by 1,2 order by 1,2) x),'[]'));
end $$;
create or replace function public.stayman_finance_report(p_property uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; days jsonb;
begin
 result:=public.stayman_finance_report_pre_closure(p_property,p_from,p_to);
 select coalesce(jsonb_agg(d.value||jsonb_build_object('feeRevenue',(select coalesce(sum(r.closure_fee),0) from public.stayman_reservations r join public.stayman_properties p on p.id=r.property_id where r.property_id=p_property and (r.closure_at at time zone p.timezone)::date=(d.value->>'day')::date)) order by d.value->>'day'),'[]') into days from jsonb_array_elements(result->'days') d;
 return jsonb_set(result,'{days}',days)||jsonb_build_object('closureOutstandingNow',(select coalesce(sum(greatest(0,closure_fee-paid_amount)),0) from public.stayman_reservations where property_id=p_property and status='CANCELLED' and closure_money_handler='PROPERTY'),'closureRefundDueNow',(select coalesce(sum(greatest(0,paid_amount-closure_fee)),0) from public.stayman_reservations where property_id=p_property and status='CANCELLED' and closure_money_handler='PROPERTY'));
end $$;
create or replace function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; rows jsonb;
begin
 result:=public.stayman_guest_directory_pre_closure(p_property,p_search,p_filter,p_checkin,p_page,p_size,p_date_from,p_date_to,p_date_field);
 select coalesce(jsonb_agg(e.value||coalesce((select jsonb_build_object('closure_kind',r.closure_kind,'closure_fee',r.closure_fee,'closure_money_handler',r.closure_money_handler) from public.stayman_reservations r where r.id=(e.value->>'reservation_id')::uuid),'{}') order by e.ordinality),'[]') into rows from jsonb_array_elements(result->'rows') with ordinality e(value,ordinality);
 return jsonb_set(result,'{rows}',rows);
end $$;
revoke all on function public.stayman_workspace_data_pre_closure(uuid,text,date,date,uuid,integer,integer,text,text),public.stayman_finance_report_pre_closure(uuid,date,date),public.stayman_guest_directory_pre_closure(uuid,text,text,text,integer,integer,date,date,text) from public,anon,authenticated;
revoke all on function public.stayman_record_payment(uuid,bigint,text,text,uuid),public.stayman_refund(uuid,bigint,text,text,uuid),public.stayman_settlement_history(uuid),public.stayman_external_settlement(uuid,text,text,uuid),public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text),public.stayman_finance_report(uuid,date,date),public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) from public,anon;
grant execute on function public.stayman_record_payment(uuid,bigint,text,text,uuid),public.stayman_refund(uuid,bigint,text,text,uuid),public.stayman_settlement_history(uuid),public.stayman_external_settlement(uuid,text,text,uuid),public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text),public.stayman_finance_report(uuid,date,date),public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;


-- 202610230041_guest_corrections.sql
begin;
alter table public.stayman_guests add column if not exists address text not null default '' check(length(address)<=500);
create table if not exists public.stayman_guest_corrections(
 property_id uuid references public.stayman_properties(id),kind text check(kind in ('guest','member','walkin')),entity_id uuid,
 fields jsonb not null,version bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),
 primary key(property_id,kind,entity_id)
);
create table if not exists public.stayman_guest_correction_history(
 id uuid primary key default gen_random_uuid(),property_id uuid references public.stayman_properties(id),kind text,entity_id uuid,
 before_fields jsonb,after_fields jsonb,reason text,actor uuid references auth.users(id),created_at timestamptz not null default now()
);
alter table public.stayman_guest_corrections enable row level security;
alter table public.stayman_guest_correction_history enable row level security;
revoke all on public.stayman_guest_corrections,public.stayman_guest_correction_history from public,anon,authenticated;

create or replace function public.stayman_guest_edit_context(p_property uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare gid uuid; submission jsonb; fields jsonb; key_kind text:=p_kind; key_id uuid:=p_id; correction public.stayman_guest_corrections; edited_name text; display text;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_kind='guest' then
  select id into gid from public.stayman_guests where property_id=p_property and id=p_id;
  if gid is null then raise exception 'Guest not found.'; end if;
  select i.details into submission from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.guest_id=gid and m.property_id=p_property and i.status='completed' order by i.completed_at desc nulls last,m.created_at desc limit 1;
 elsif p_kind='member' then
  select m.guest_id,i.details,m.display_name into gid,submission,display from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.id=p_id and m.property_id=p_property;
  if not found then raise exception 'Guest not found.'; end if;
 elsif p_kind='walkin' then
  select i.details,coalesce(i.staff_name,i.details->>'full_name') into submission,display from public.guest_checkin_invitations i where i.id=p_id and i.property_id=p_property and i.status='completed';
  if not found then raise exception 'Guest not found.'; end if;
 else raise exception 'Invalid guest kind.';
 end if;
 if gid is not null then
  key_kind:='guest';key_id:=gid;
  select jsonb_build_object('full_name',full_name,'phone',coalesce(phone,''),'email',coalesce(email,''),'gender',gender,'nationality',nationality,'address',coalesce(nullif(address,''),submission->>'address','')) into fields from public.stayman_guests where id=gid and property_id=p_property;
 else fields:=jsonb_build_object('full_name',coalesce(display,submission->>'full_name',''),'phone',coalesce(submission->>'phone',''),'email',coalesce(submission->>'email',''),'gender',coalesce(submission->>'gender','NOT_PROVIDED'),'nationality',coalesce(submission->>'nationality','India'),'address',coalesce(submission->>'address',''));
 end if;
 select * into correction from public.stayman_guest_corrections where property_id=p_property and kind=key_kind and entity_id=key_id;
 if correction.entity_id is null and key_kind<>p_kind then
  -- A previously unlinked member's correction remains visible after explicit linking.
  select * into correction from public.stayman_guest_corrections where property_id=p_property and kind=p_kind and entity_id=p_id;
 end if;
 if correction.entity_id is not null then
  fields:=fields||correction.fields;
  select coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1),'Owner') into edited_name from auth.users where id=correction.updated_by;
 end if;
 return jsonb_build_object('fields',fields,'key_kind',key_kind,'key_id',key_id,'version',coalesce((select version from public.stayman_guest_corrections where property_id=p_property and kind=key_kind and entity_id=key_id),0),
  'can_edit',public.stayman_is_owner(p_property),'edited_at',correction.updated_at,'edited_by',edited_name);
end $$;

create or replace function public.stayman_save_guest_correction(p_property uuid,p_kind text,p_id uuid,p_fields jsonb,p_version bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare context jsonb; fields jsonb; gid uuid; rid uuid; key_kind text; key_id uuid;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to edit personal details.'; end if;
 context:=public.stayman_guest_edit_context(p_property,p_kind,p_id);key_kind:=context->>'key_kind';key_id:=(context->>'key_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_property::text||key_kind||key_id::text,84920));
 context:=public.stayman_guest_edit_context(p_property,p_kind,p_id);
 if (context->>'version')::bigint is distinct from p_version then raise exception 'Guest details changed. Refresh and review before saving.'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or coalesce(length(trim(p_fields->>'full_name')),0) not between 2 and 100
  or coalesce(length(p_fields->>'phone'),0)>25 or coalesce(length(p_fields->>'email'),0)>254 or coalesce(length(p_fields->>'address'),0)>500
  or coalesce(length(trim(p_fields->>'nationality')),0) not between 2 and 100
  or coalesce(p_fields->>'gender','') not in ('MALE','FEMALE','NON_BINARY','PREFER_NOT_TO_SAY','NOT_PROVIDED','OTHER')
  or coalesce(length(trim(p_reason)),0) not between 3 and 500 then raise exception 'Enter valid personal details and a correction reason.'; end if;
 if coalesce(p_fields->>'phone','')<>'' and p_fields->>'phone' !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Enter a phone number with country code.'; end if;
 if coalesce(p_fields->>'email','')<>'' and p_fields->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email.'; end if;
 fields:=jsonb_build_object('full_name',trim(p_fields->>'full_name'),'phone',coalesce(trim(p_fields->>'phone'),''),'email',lower(coalesce(trim(p_fields->>'email'),'')),'gender',p_fields->>'gender','nationality',trim(p_fields->>'nationality'),'address',coalesce(trim(p_fields->>'address'),''));
 if key_kind='guest' then gid:=key_id; else select reservation_id into rid from public.stayman_booking_members where property_id=p_property and id=p_id; end if;
 if exists(select 1 from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id join public.stayman_reservations r on r.id=a.reservation_id
  where a.property_id=p_property and r.status in ('PENDING','CHECKED_IN') and a.check_out_date>(now() at time zone (select timezone from public.stayman_properties where id=p_property))::date
   and (r.guest_id=gid or r.id=rid or exists(select 1 from public.stayman_booking_members m where m.reservation_id=r.id and m.guest_id=gid))
   and ((u.gender_policy='MALE_ONLY' and fields->>'gender'<>'MALE') or (u.gender_policy='FEMALE_ONLY' and fields->>'gender'<>'FEMALE'))) then raise exception 'Gender conflicts with an assigned restricted dorm. Review the allocation first.'; end if;
 if gid is not null then
  update public.stayman_guests set full_name=fields->>'full_name',phone=nullif(fields->>'phone',''),email=nullif(fields->>'email',''),gender=fields->>'gender',nationality=fields->>'nationality',address=fields->>'address' where id=gid and property_id=p_property;
  update public.stayman_booking_members set display_name=fields->>'full_name' where guest_id=gid and property_id=p_property;
 elsif p_kind='member' then update public.stayman_booking_members set display_name=fields->>'full_name' where id=p_id and property_id=p_property;
 elsif p_kind='walkin' then update public.guest_checkin_invitations set staff_name=fields->>'full_name' where id=p_id and property_id=p_property;
 end if;
 insert into public.stayman_guest_corrections(property_id,kind,entity_id,fields,updated_by) values(p_property,key_kind,key_id,fields,auth.uid())
 on conflict(property_id,kind,entity_id) do update set fields=excluded.fields,version=stayman_guest_corrections.version+1,updated_at=now(),updated_by=auth.uid();
 insert into public.stayman_guest_correction_history(property_id,kind,entity_id,before_fields,after_fields,reason,actor)
 values(p_property,key_kind,key_id,context->'fields',fields,trim(p_reason),auth.uid());
end $$;

do $$ begin
 if to_regprocedure('public.stayman_guest_profile_pre_corrections(uuid,text,uuid)') is null then alter function public.stayman_guest_profile(uuid,text,uuid) rename to stayman_guest_profile_pre_corrections; end if;
 if to_regprocedure('public.stayman_guest_directory_pre_corrections(uuid,text,text,text,integer,integer,date,date,text)') is null then alter function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) rename to stayman_guest_directory_pre_corrections; end if;
 if to_regprocedure('public.stayman_edit_reservation_pre_corrections(uuid,jsonb,jsonb)') is null then alter function public.stayman_edit_reservation(uuid,jsonb,jsonb) rename to stayman_edit_reservation_pre_corrections; end if;
 if to_regprocedure('public.stayman_rename_guest_pre_corrections(uuid,text,uuid,text)') is null then alter function public.stayman_rename_guest(uuid,text,uuid,text) rename to stayman_rename_guest_pre_corrections; end if;
end $$;
create or replace function public.stayman_guest_profile(p_property uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; context jsonb;
begin
 result:=public.stayman_guest_profile_pre_corrections(p_property,p_kind,p_id);
 context:=public.stayman_guest_edit_context(p_property,p_kind,p_id);
 return result||jsonb_build_object('personal',context,'correction_history',coalesce((select jsonb_agg(to_jsonb(x)) from (select h.created_at,h.reason,h.before_fields,h.after_fields,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1),'Owner') as actor_name from public.stayman_guest_correction_history h left join auth.users u on u.id=h.actor where h.property_id=p_property and h.kind=context->>'key_kind' and h.entity_id=(context->>'key_id')::uuid order by h.created_at desc,h.id limit 10) x),'[]'));
end $$;
create or replace function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; entry jsonb; rows jsonb:='[]'; context jsonb;
begin
 result:=public.stayman_guest_directory_pre_corrections(p_property,p_search,p_filter,p_checkin,p_page,p_size,p_date_from,p_date_to,p_date_field);
 for entry in select value from jsonb_array_elements(result->'rows') loop
  context:=public.stayman_guest_edit_context(p_property,entry->>'kind',(entry->>'id')::uuid);
  rows:=rows||jsonb_build_array(entry||jsonb_build_object('name',context->'fields'->>'full_name','phone',context->'fields'->>'phone','email',context->'fields'->>'email','gender',context->'fields'->>'gender','nationality',context->'fields'->>'nationality'));
 end loop;
 return jsonb_set(result,'{rows}',rows);
end $$;
create or replace function public.stayman_edit_reservation(p_reservation uuid,p_details jsonb,p_expected jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; g public.stayman_guests;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select * into g from public.stayman_guests where id=r.guest_id;
 if not public.stayman_is_owner(r.property_id) and (trim(p_details->>'name') is distinct from g.full_name or trim(p_details->>'phone') is distinct from coalesce(g.phone,'') or lower(coalesce(trim(p_details->>'email'),'')) is distinct from lower(coalesce(g.email,''))) then raise exception 'Owner access required to correct guest personal details.'; end if;
 perform public.stayman_edit_reservation_pre_corrections(p_reservation,p_details,p_expected);
end $$;
create or replace function public.stayman_rename_guest(p_property uuid,p_kind text,p_id uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to correct guest personal details.'; end if;
 perform public.stayman_rename_guest_pre_corrections(p_property,p_kind,p_id,p_name);
end $$;
revoke all on function public.stayman_guest_profile_pre_corrections(uuid,text,uuid),public.stayman_guest_directory_pre_corrections(uuid,text,text,text,integer,integer,date,date,text),public.stayman_edit_reservation_pre_corrections(uuid,jsonb,jsonb),public.stayman_rename_guest_pre_corrections(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.stayman_guest_edit_context(uuid,text,uuid),public.stayman_save_guest_correction(uuid,text,uuid,jsonb,bigint,text),public.stayman_guest_profile(uuid,text,uuid),public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text),public.stayman_edit_reservation(uuid,jsonb,jsonb),public.stayman_rename_guest(uuid,text,uuid,text) from public,anon;
grant execute on function public.stayman_guest_edit_context(uuid,text,uuid),public.stayman_save_guest_correction(uuid,text,uuid,jsonb,bigint,text),public.stayman_guest_profile(uuid,text,uuid),public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text),public.stayman_edit_reservation(uuid,jsonb,jsonb),public.stayman_rename_guest(uuid,text,uuid,text) to authenticated;
create or replace function public.stayman_invoice_context(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; r public.stayman_reservations;
begin
 result:=public.stayman_folio_preview(p_reservation);
 select * into r from public.stayman_reservations where id=p_reservation;
 return result||jsonb_build_object('guest_address',case when result->>'status'='ISSUED' then null else coalesce((select fields->>'address' from public.stayman_guest_corrections where property_id=r.property_id and kind='guest' and entity_id=r.guest_id),(select nullif(address,'') from public.stayman_guests where id=r.guest_id and property_id=r.property_id),
 (select nullif(trim(i.details->>'address'),'') from public.stayman_booking_members m
 join public.guest_checkin_invitations i on i.id=m.invitation_id and i.property_id=m.property_id
 where m.reservation_id=r.id and m.property_id=r.property_id and m.guest_id=r.guest_id and i.status='completed'
 and nullif(trim(i.details->>'address'),'') is not null
 order by i.completed_at desc nulls last,m.created_at desc,m.id limit 1)) end,'checkout_status',r.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'checked_out_at',checked_out_at) order by created_at,id),'[]') from public.stayman_booking_members where reservation_id=r.id),'rooms',case when r.checked_out_at is not null then r.checkout_rooms else result->'rooms' end);
end $$;
create or replace function public.stayman_checkin_notifications(p_property uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date; result jsonb; local_now timestamp; checkout_time time;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 select now() at time zone timezone,coalesce(check_out_time,'11:00'::time) into local_now,checkout_time from public.stayman_properties where id=p_property;
 today:=local_now::date;
 with pending as (
  select r.id,r.guest_id,r.booking_ref,r.check_in_date,r.check_out_date,r.status,
   g.full_name as guest_name,
   exists(select 1 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
    where m.reservation_id=r.id and i.status='completed' and (i.details->'document_screening' @> '{"front":"manual-review"}'::jsonb
     or i.details->'document_screening' @> '{"back":"manual-review"}'::jsonb)) as needs_review,
   exists(select 1 from public.stayman_allocations a where a.reservation_id=r.id and a.check_in_date<=today and a.check_out_date>today) as has_room
  from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id
  where r.property_id=p_property and r.status='PENDING' and r.check_out_date>today
   and exists(select 1 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.reservation_id=r.id and i.status='completed')
 ), raw_walkins as (
  select i.id,jsonb_build_object('full_name',coalesce(i.staff_name,i.details->>'full_name'),'document_screening',i.details->'document_screening','departure_date',i.details->>'departure_date') as details,
   coalesce((i.details->>'departure_date') ~ '^\d{4}-\d{2}-\d{2}$' and ((i.details->>'departure_date')<today::text or ((i.details->>'departure_date')=today::text and local_now::time>=checkout_time)),false) as expired
  from public.guest_checkin_invitations i where i.property_id=p_property and i.source='public_qr' and i.status='completed'
   and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id)
 ), walkins as (select id,details from raw_walkins where not expired),
 missed_walkins as (select id,details from raw_walkins where expired),
 overdue as (
  select r.id,r.booking_ref,r.check_out_date,g.full_name as guest_name
  from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id
  where r.property_id=p_property and r.status='CHECKED_IN' and r.check_out_date+checkout_time<=local_now
 ), missed as (
  select r.id,r.booking_ref,r.check_in_date,r.check_out_date,g.full_name as guest_name
  from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id
  where r.property_id=p_property and r.status='PENDING' and r.check_out_date+checkout_time<=local_now
   and exists(select 1 from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
    where m.reservation_id=r.id and i.status='completed')
 )
 select jsonb_build_object(
  'revision',md5(
   coalesce((select jsonb_agg(jsonb_build_array(r.id,r.status,r.check_in_date,r.check_out_date,r.total_amount,r.paid_amount) order by r.id)::text from public.stayman_reservations r where r.property_id=p_property and (r.status in ('PENDING','CHECKED_IN') or r.check_out_date>=today or r.created_at>=(today-1)::timestamp at time zone (select timezone from public.stayman_properties where id=p_property))),'')||
   coalesce((select p.paid_at::text from public.stayman_payments p where p.property_id=p_property order by p.paid_at desc limit 1),'')||
   coalesce((select p.paid_at::text from public.stayman_folio_payments p where p.property_id=p_property order by p.paid_at desc limit 1),'')||
   coalesce((select jsonb_agg(jsonb_build_array(i.id,i.clean,i.dirty,i.laundry,i.low_stock) order by i.id)::text from public.stayman_stock_items i where i.property_id=p_property),'')||
   coalesce((select jsonb_agg(jsonb_build_array(e.id,e.amount_paise,e.paid_date,e.voided_at) order by e.id)::text from public.stayman_expenses e where e.property_id=p_property and (e.expense_date>=today-6 or e.paid_date>=today-6 or e.paid_date is null)),'')
  ),
  'overdue_count',(select count(*) from overdue),
  'overdue',coalesce((select jsonb_agg(to_jsonb(x) order by check_out_date,id) from (select * from overdue order by check_out_date,id limit 100) x),'[]'::jsonb),
  'missed_count',(select count(*) from missed)+(select count(*) from missed_walkins),
  'missed',coalesce((select jsonb_agg(to_jsonb(x) order by check_out_date,id) from (select * from missed order by check_out_date,id limit 100) x),'[]'::jsonb),
  'missed_walkins',coalesce((select jsonb_agg(to_jsonb(x) order by id) from (select * from missed_walkins order by id limit 100) x),'[]'::jsonb),
  'count',(select count(*) from pending where check_in_date<=today)+(select count(*) from walkins),
  'due',coalesce((select jsonb_agg(to_jsonb(p) order by check_in_date,id) from (select * from pending where check_in_date<=today order by check_in_date,id limit 100) p),'[]'::jsonb),
  'upcoming',coalesce((select jsonb_agg(to_jsonb(p) order by check_in_date,id) from (select * from pending where check_in_date>today order by check_in_date,id limit 100) p),'[]'::jsonb),
  'upcoming_count',(select count(*) from pending where check_in_date>today),
  'walkins',coalesce((select jsonb_agg(to_jsonb(w) order by id) from (select * from walkins order by id limit 100) w),'[]'::jsonb)
 ) into result;
 return result;
end $$;
notify pgrst,'reload schema';
commit;


-- 202610230042_aiosell_no_show.sql
-- Documented POST /marknoshow/{pms}; supported channels booking.com and gommt.
-- Network failures require review before retry: remote idempotency is not assumed.
begin;
create table if not exists public.stayman_no_show_outbox(
 reservation_id uuid primary key references public.stayman_reservations(id) on delete cascade,
 property_id uuid not null references public.stayman_properties(id),hotel_code text,booking_id text,channel text,
 manual_only boolean not null default false,status text not null check(status in ('PENDING','SENDING','SENT','REVIEW')),message text,
 lease uuid,lease_until timestamptz,attempts integer not null default 0,updated_at timestamptz not null default now()
);
alter table public.stayman_no_show_outbox enable row level security;
revoke all on public.stayman_no_show_outbox from public,anon,authenticated;
grant all on public.stayman_no_show_outbox to service_role;
create or replace function public.stayman_queue_no_show() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.stayman_aiosell_bookings; hotel text; channel_code text; linked integer;
begin
 if new.closure_kind='NO_SHOW' and old.closure_kind is distinct from 'NO_SHOW' then
  select count(*) into linked from public.stayman_aiosell_bookings where reservation_id=new.id;
  if linked=0 then return new; end if;
  select * into b from public.stayman_aiosell_bookings where reservation_id=new.id order by channel,booking_id limit 1;
  select hotel_code into hotel from public.stayman_aiosell_connections where property_id=new.property_id;
  channel_code:=case regexp_replace(lower(b.channel),'[^a-z0-9]','','g') when 'bookingcom' then 'booking.com' when 'gommt' then 'gommt' when 'goibibo' then 'gommt' when 'makemytrip' then 'gommt' end;
  insert into public.stayman_no_show_outbox(reservation_id,property_id,hotel_code,booking_id,channel,manual_only,status,message)
  values(new.id,new.property_id,hotel,b.booking_id,channel_code,linked<>1 or channel_code is null or hotel is null,
   case when linked=1 and channel_code is not null and hotel is not null then 'PENDING' else 'REVIEW' end,
   case when linked<>1 then 'Multiple external booking references: review in Aiosell.' when channel_code is null then 'No-show push is not documented for this channel; update the provider manually.' when hotel is null then 'Aiosell connection is missing.' else 'Queued. Inventory sync is tracked separately.' end)
  on conflict(reservation_id) do nothing;
  update public.stayman_aiosell_connections set revision=revision+1,retry_at=now() where property_id=new.property_id and enabled;
 end if;
 return new;
end $$;
create or replace trigger stayman_queue_no_show after update of closure_kind on public.stayman_reservations for each row execute function public.stayman_queue_no_show();
revoke all on function public.stayman_queue_no_show() from public,anon,authenticated;

create or replace function public.stayman_no_show_sync_state(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.stayman_reservations; job public.stayman_no_show_outbox; enabled boolean;
begin
 select * into r from public.stayman_reservations where id=p_reservation;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select * into job from public.stayman_no_show_outbox where reservation_id=r.id;
 if not found then return jsonb_build_object('status','NOT_LINKED','message','No external no-show update is required for this direct booking.','can_send',false); end if;
 select c.enabled into enabled from public.stayman_aiosell_connections c where property_id=r.property_id;
 return jsonb_build_object('status',case when job.status='SENDING' and job.lease_until<now() then 'REVIEW' else job.status end,
  'message',case when job.status='PENDING' and not coalesce(enabled,false) then 'Background sync is off. An owner can send this no-show explicitly.' when job.status='SENDING' and job.lease_until<now() then 'Previous attempt was interrupted. Verify the provider status before retrying.' else job.message end,
  'can_send',public.stayman_is_owner(r.property_id) and not job.manual_only and job.hotel_code is not null and job.channel is not null and (job.status in ('PENDING','REVIEW') or (job.status='SENDING' and job.lease_until<now())),
  'can_confirm',public.stayman_is_owner(r.property_id) and (job.status in ('PENDING','REVIEW') or (job.status='SENDING' and job.lease_until<now())),
  'needs_verification',job.status='REVIEW' or (job.status='SENDING' and job.lease_until<now()));
end $$;
create or replace function public.stayman_no_show_claim(p_property uuid default null,p_reservation uuid default null,p_manual boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.stayman_no_show_outbox; token uuid:=gen_random_uuid();
begin
 select o.* into job from public.stayman_no_show_outbox o join public.stayman_aiosell_connections c on c.property_id=o.property_id
 where (p_property is null or o.property_id=p_property) and (p_reservation is null or o.reservation_id=p_reservation)
  and not o.manual_only and (c.enabled or p_manual) and o.channel is not null and o.hotel_code is not null
  and (o.status='PENDING' or (p_manual and (o.status='REVIEW' or (o.status='SENDING' and o.lease_until<now()))))
  and exists(select 1 from public.stayman_reservations r where r.id=o.reservation_id and r.closure_kind='NO_SHOW' and r.status='CANCELLED')
 order by o.updated_at,o.reservation_id for update of o skip locked limit 1;
 if not found then return null; end if;
 update public.stayman_no_show_outbox set status='SENDING',lease=token,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where reservation_id=job.reservation_id;
 return jsonb_build_object('reservation',job.reservation_id,'property',job.property_id,'lease',token,'hotelCode',job.hotel_code,'bookingId',job.booking_id,'channel',job.channel);
end $$;
create or replace function public.stayman_no_show_finish(p_reservation uuid,p_lease uuid,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.stayman_no_show_outbox set status=case when p_error is null then 'SENT' else 'REVIEW' end,
  message=case when p_error is null then 'No-show accepted by Aiosell. Inventory sync is tracked separately.' else left(p_error,500)||' Verify the provider status before retrying; the request may have been applied.' end,
  lease=null,lease_until=null,updated_at=now() where reservation_id=p_reservation and lease=p_lease and status='SENDING';
 if not found then raise exception 'No-show lease expired or changed; review provider status before retrying.'; end if;
end $$;
revoke all on function public.stayman_no_show_claim(uuid,uuid,boolean),public.stayman_no_show_finish(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.stayman_no_show_claim(uuid,uuid,boolean),public.stayman_no_show_finish(uuid,uuid,text) to service_role;
revoke all on function public.stayman_no_show_sync_state(uuid) from public,anon;
grant execute on function public.stayman_no_show_sync_state(uuid) to authenticated;

create or replace function public.stayman_confirm_no_show_remote(p_reservation uuid,p_reference text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required.'; end if;
 if r.closure_kind<>'NO_SHOW' or coalesce(length(trim(p_reference)),0) not between 2 and 200 or coalesce(length(trim(p_note)),0) not between 3 and 500 then raise exception 'Enter the provider confirmation reference and verification note.'; end if;
 update public.stayman_no_show_outbox set status='SENT',message='Owner verified provider no-show: '||trim(p_reference),lease=null,lease_until=null,updated_at=now()
 where reservation_id=r.id and (status in ('REVIEW','PENDING') or (status='SENDING' and lease_until<now()));
 if not found then raise exception 'An attempt is active or the no-show is already acknowledged. Refresh first.'; end if;
 insert into public.stayman_staff_actions(property_id,entity_id,action,after_details,actor) values(r.property_id,r.id,'NO_SHOW_SYNC_CONFIRMED',jsonb_build_object('reference',trim(p_reference),'reason',trim(p_note)),auth.uid());
end $$;
revoke all on function public.stayman_confirm_no_show_remote(uuid,text,text) from public,anon;
grant execute on function public.stayman_confirm_no_show_remote(uuid,text,text) to authenticated;

create or replace function public.stayman_reopen_no_show(p_reservation uuid,p_reason text,p_expected_fee bigint,p_expected_paid bigint) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; a jsonb; today date;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_owner(r.property_id) then raise exception 'Owner access required.'; end if;
 if r.status<>'CANCELLED' or r.closure_kind<>'NO_SHOW' or r.closure_fee is distinct from p_expected_fee or r.paid_amount is distinct from p_expected_paid then raise exception 'Booking changed or is not a no-show. Refresh and review again.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 500 then raise exception 'Enter a reversal reason.'; end if;
 if exists(select 1 from public.stayman_aiosell_bookings where reservation_id=r.id) then raise exception 'Reconcile the OTA no-show with the provider first. Automatic external reversal is not supported; create a new booking if required.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=r.property_id;
 if r.check_out_date<=today then raise exception 'This stay has ended. Use a new booking with the actual arrival/departure dates.'; end if;
 if coalesce(jsonb_array_length(r.cancelled_allocations),0)=0 then raise exception 'Original room assignments are missing. Create a new booking after checking availability.'; end if;
 for a in select value from jsonb_array_elements(r.cancelled_allocations) loop
  if exists(select 1 from public.stayman_allocations x where x.unit_id=(a->>'unit_id')::uuid and daterange(x.check_in_date,x.check_out_date,'[)')&&daterange((a->>'check_in_date')::date,(a->>'check_out_date')::date,'[)')) then raise exception 'The room/bed has another booking. No-show cannot be reversed into occupied inventory.'; end if;
 end loop;
 update public.stayman_reservations set status='PENDING',closure_kind=null,closure_fee=0,closure_at=null,closure_notice_at=null,closure_money_handler='PROPERTY',cancelled_at=null,cancelled_by=null,cancellation_reason=null where id=r.id;
 for a in select value from jsonb_array_elements(r.cancelled_allocations) loop
  insert into public.stayman_allocations(id,property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
  values((a->>'id')::uuid,r.property_id,r.id,(a->>'unit_id')::uuid,(a->>'check_in_date')::date,(a->>'check_out_date')::date,'PENDING',(a->>'charge_paise')::bigint);
 end loop;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor)
 values(r.property_id,r.id,'NO_SHOW_REVERSED',to_jsonb(r),jsonb_build_object('reason',trim(p_reason),'fee_reversed',r.closure_fee,'recorded_at',now()),auth.uid());
end $$;
revoke all on function public.stayman_reopen_no_show(uuid,text,bigint,bigint) from public,anon;
grant execute on function public.stayman_reopen_no_show(uuid,text,bigint,bigint) to authenticated;
notify pgrst,'reload schema';
commit;


-- 202610230043_review_queue.sql
-- Keep failed/manual no-show updates visible without another dashboard request.
begin;
create index if not exists stayman_no_show_pending on public.stayman_no_show_outbox(property_id,status,updated_at);
create index if not exists stayman_staff_actions_recent on public.stayman_staff_actions(property_id,created_at desc);
create index if not exists stayman_staff_actions_entity on public.stayman_staff_actions(property_id,entity_id,created_at desc);
create index if not exists stayman_guest_corrections_recent on public.stayman_guest_corrections(property_id,updated_at desc);
create index if not exists stayman_closure_dates on public.stayman_reservations(property_id,closure_at) where closure_kind is not null;
do $$ begin
 if to_regprocedure('public.stayman_checkin_notifications_pre_review(uuid)') is null then
  alter function public.stayman_checkin_notifications(uuid) rename to stayman_checkin_notifications_pre_review;
 end if;
end $$;
create or replace function public.stayman_checkin_notifications(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.stayman_checkin_notifications_pre_review(p_property);
 return result||jsonb_build_object(
  'revision',md5(coalesce(result->>'revision','')||coalesce((select created_at::text from public.stayman_staff_actions where property_id=p_property order by created_at desc limit 1),'')||coalesce((select updated_at::text from public.stayman_guest_corrections where property_id=p_property order by updated_at desc limit 1),'')),
  'no_show_sync_count',(select count(*) from public.stayman_no_show_outbox where property_id=p_property and status<>'SENT'),
  'no_show_sync',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select o.reservation_id as id,g.full_name as guest_name,o.status,o.message from public.stayman_no_show_outbox o
   join public.stayman_reservations r on r.id=o.reservation_id join public.stayman_guests g on g.id=r.guest_id
   where o.property_id=p_property and o.status<>'SENT' order by o.updated_at,o.reservation_id limit 30
  ) x),'[]'));
end $$;
revoke all on function public.stayman_checkin_notifications_pre_review(uuid) from public,anon,authenticated;
revoke all on function public.stayman_checkin_notifications(uuid) from public,anon;
grant execute on function public.stayman_checkin_notifications(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
