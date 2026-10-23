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
