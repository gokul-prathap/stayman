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
