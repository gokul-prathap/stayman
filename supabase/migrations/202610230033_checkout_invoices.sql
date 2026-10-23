-- After 032. Checkout and paid-in-full invoices without administrator approval.
begin;
alter table public.stayman_booking_members add column if not exists checked_out_at timestamptz;
alter table public.stayman_reservations add column if not exists checked_out_at timestamptz;
alter table public.stayman_reservations add column if not exists checkout_rooms jsonb not null default '[]';
-- Preserve booked allocation history for reports; only release nights from actual checkout onward.
create or replace function public.stayman_checkout_guests(p_reservation uuid,p_members uuid[],p_all boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; today date;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status='CHECKED_OUT' then return; end if;
 if r.status<>'CHECKED_IN' then raise exception 'Only checked-in guests can check out.'; end if;
 if exists(select 1 from unnest(p_members) v where not exists(select 1 from public.stayman_booking_members m where m.id=v and m.reservation_id=r.id)) then raise exception 'Guest does not belong to this booking.'; end if;
 if p_all is null then raise exception 'Choose checkout scope.'; end if;
 if not p_all and coalesce(cardinality(p_members),0)=0 then raise exception 'Select departing guests.'; end if;
 update public.stayman_booking_members set checked_out_at=coalesce(checked_out_at,now()) where reservation_id=r.id and (p_all or id=any(p_members));
 if not exists(select 1 from public.stayman_booking_members where reservation_id=r.id and checked_out_at is null) then
  today:=(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date;
  update public.stayman_reservations set status='CHECKED_OUT',checked_out_at=now(),checkout_rooms=(select coalesce(jsonb_agg(jsonb_build_object('room',u.room_name,'unit',u.label,'from',a.check_in_date,'to',a.check_out_date)),'[]') from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id where a.reservation_id=r.id) where id=r.id;
  delete from public.stayman_allocations where reservation_id=r.id and check_in_date>=today;
  update public.stayman_allocations set check_out_date=today where reservation_id=r.id and check_out_date>today and check_in_date<today;
 end if;
 insert into public.stayman_billing_events(property_id,action,actor,details) values(r.property_id,'GUEST_CHECKOUT',auth.uid(),jsonb_build_object('reservation_id',r.id,'members',p_members,'all',p_all));
end $$;
create or replace function public.stayman_folio_preview(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; p public.stayman_properties; f public.stayman_folios; g public.stayman_guests;
 settings jsonb; lines jsonb:='[]'; line jsonb; charge public.stayman_folio_charges; rate jsonb; total bigint:=0; taxable bigint:=0; cg bigint:=0; sg bigint:=0; ig bigint:=0; adjustment bigint:=0; extras_paid bigint; payments jsonb;
begin
 select * into r from public.stayman_reservations where id=p_reservation;
 if not found or not (public.stayman_is_staff(r.property_id) or public.stayman_is_platform_admin()) then raise exception 'Property access required.'; end if;
 select * into p from public.stayman_properties where id=r.property_id;
 select * into g from public.stayman_guests where id=r.guest_id;
 select * into f from public.stayman_folios where reservation_id=r.id;
 select coalesce(sum(amount-accommodation_applied),0) into extras_paid from public.stayman_folio_payments where folio_id=f.id;
 select coalesce(jsonb_agg(payment order by payment->>'date'),'[]') into payments from (
  select jsonb_build_object('date',paid_at,'method',method,'amount',case when kind='REFUND' then -amount_paise else amount_paise end,'note',note) payment from public.stayman_payments where reservation_id=r.id
  union all select jsonb_build_object('date',paid_at,'method',method,'amount',amount,'note',note) from public.stayman_folio_payments where folio_id=f.id
 ) all_payments;
 if f.status='ISSUED' then return f.snapshot||jsonb_build_object('folio_id',f.id,'status','ISSUED','invoice_number',f.invoice_number,'issued_at',f.issued_at,'net_paid',r.paid_amount+extras_paid,'balance',(f.snapshot->>'total')::bigint-r.paid_amount-extras_paid,'payments',payments); end if;
 settings:=public.stayman_billing_profile(r.property_id);
 rate:=case when settings->>'registration'='REGISTERED' then settings->'catalog'->'ACCOMMODATION' else '{}'::jsonb end;
 line:=public.stayman_calculate_bill_line(r.total_amount,rate,coalesce(settings->>'price_mode','INCLUSIVE'))||jsonb_build_object('description','Accommodation','category','ACCOMMODATION','quantity',1,'unit_amount',r.total_amount,'amount',r.total_amount);
 lines:=lines||jsonb_build_array(line);
 for charge in select * from public.stayman_folio_charges where folio_id=f.id and voided_at is null order by created_at,id loop
  rate:=case when settings->>'registration'='REGISTERED' then settings->'catalog'->charge.category else '{}'::jsonb end;
  line:=public.stayman_calculate_bill_line(charge.quantity::bigint*charge.unit_amount,rate,coalesce(settings->>'price_mode','INCLUSIVE'))||jsonb_build_object('id',charge.id,'category',charge.category,'description',charge.description,'quantity',charge.quantity,'unit_amount',charge.unit_amount,'note',charge.note,'amount',charge.quantity::bigint*charge.unit_amount);
  lines:=lines||jsonb_build_array(line);
 end loop;
 for line in select value from jsonb_array_elements(lines) loop
  total:=total+(line->>'total')::bigint;taxable:=taxable+(line->>'taxable')::bigint;cg:=cg+(line->>'cgst')::bigint;sg:=sg+(line->>'sgst')::bigint;ig:=ig+(line->>'igst')::bigint;adjustment:=adjustment+(line->>'adjustment')::bigint;
 end loop;
 return jsonb_build_object('folio_id',f.id,'reservation_id',r.id,'status',coalesce(f.status,'DRAFT'),'review_note',(select details->>'reason' from public.stayman_billing_events where folio_id=f.id and action='RETURNED' order by created_at desc,id desc limit 1),'property',jsonb_build_object('id',p.id,'name',p.name,'address',p.address,'phone',p.phone,'logo_path',p.logo_path),'settings',settings,
 'guest',jsonb_build_object('name',g.full_name,'phone',g.phone,'email',g.email),'booking',jsonb_build_object('reference',r.booking_ref,'arrival',r.check_in_date,'departure',r.check_out_date,'accommodation',r.total_amount,'nights',r.check_out_date-r.check_in_date,'status',r.status),
 'rooms',case when r.checked_out_at is not null then r.checkout_rooms else (select coalesce(jsonb_agg(jsonb_build_object('room',u.room_name,'unit',u.label,'from',a.check_in_date,'to',a.check_out_date) order by a.check_in_date),'[]') from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id where a.reservation_id=r.id) end,
 'bill_to',coalesce(f.bill_to,'{}'::jsonb),'lines',lines,'taxable',taxable,'cgst',cg,'sgst',sg,'igst',ig,'adjustment',adjustment,'total',total,'net_paid',r.paid_amount+extras_paid,'balance',total-r.paid_amount-extras_paid,'payments',payments);
end $$;
create or replace function public.stayman_invoice_context(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; r public.stayman_reservations;
begin
 result:=public.stayman_folio_preview(p_reservation);
 select * into r from public.stayman_reservations where id=p_reservation;
 return result||jsonb_build_object('checkout_status',r.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'checked_out_at',checked_out_at) order by created_at,id),'[]') from public.stayman_booking_members where reservation_id=r.id),'rooms',case when r.checked_out_at is not null then r.checkout_rooms else result->'rooms' end);
end $$;
create or replace function public.stayman_prepare_folio(p_reservation uuid,p_bill_to jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; f public.stayman_folios; preview jsonb;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if r.status='CANCELLED' then raise exception 'Cannot prepare an invoice for a cancelled booking.'; end if;
 if p_bill_to is null or jsonb_typeof(p_bill_to)<>'object' or coalesce(length(trim(p_bill_to->>'name')),0) not between 2 and 100 or coalesce(length(p_bill_to->>'address'),0)>500
 or (coalesce(p_bill_to->>'gstin','')<>'' and p_bill_to->>'gstin' !~ '^[0-9]{2}[A-Z0-9]{13}$') then raise exception 'Enter a valid bill-to name, address and optional GSTIN.'; end if;
 insert into public.stayman_folios(property_id,reservation_id) values(r.property_id,r.id) on conflict(reservation_id) do nothing;
 select * into f from public.stayman_folios where reservation_id=r.id for update;
 if f.status='ISSUED' then raise exception 'This invoice has already been submitted or issued.'; end if;
 update public.stayman_folios set bill_to=jsonb_build_object('name',trim(p_bill_to->>'name'),'address',coalesce(trim(p_bill_to->>'address'),''),'gstin',coalesce(p_bill_to->>'gstin','')) where id=f.id;
 preview:=public.stayman_folio_preview(r.id);
 update public.stayman_folios set status='DRAFT',prepared_at=now(),prepared_by=auth.uid(),prepared_source=preview where id=f.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor) values(r.property_id,f.id,'BILL_DETAILS_SAVED',auth.uid());
 return f.id;
end $$;
create or replace function public.stayman_issue_folio(p_folio uuid,p_expected jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare f public.stayman_folios; preview jsonb; config jsonb; year_start integer; fy text; seq integer; number text;
begin

 perform 1 from public.stayman_reservations where id=(select reservation_id from public.stayman_folios where id=p_folio) for update;
 select * into f from public.stayman_folios where id=p_folio for update;
 if not found or not (public.stayman_is_staff(f.property_id) or public.stayman_is_platform_admin()) then raise exception 'Property access required.'; end if;
 if (select status from public.stayman_reservations where id=f.reservation_id)<>'CHECKED_OUT' then raise exception 'Check out every guest before issuing the invoice.'; end if;
 if f.status='ISSUED' then return f.invoice_number; end if;

 perform 1 from public.stayman_billing_profiles where property_id=f.property_id for share;
 preview:=public.stayman_folio_preview(f.reservation_id);config:=preview->'settings';
 if coalesce(config->>'registration','UNCONFIGURED')='UNCONFIGURED' then raise exception 'Confirm this property registration and billing configuration before issuing.'; end if;
 if config->>'registration'='REGISTERED' and exists(select 1 from jsonb_array_elements(preview->'lines') line where coalesce(line->>'sac','')='') then raise exception 'Confirm HSN/SAC for each charge used on this invoice.'; end if;
 if config->>'registration'='REGISTERED' and coalesce(length(trim(f.bill_to->>'address')),0)<2 then raise exception 'Enter the customer billing address before issuing a GST invoice.'; end if;
 if (preview->>'balance')::bigint<>0 then raise exception 'Settle the complete bill, including extras and taxes, before printing.'; end if;
 if (preview-'payments'-'net_paid'-'balance') is distinct from (p_expected-'payments'-'net_paid'-'balance') then raise exception 'Invoice or billing settings changed. Refresh and review the amounts again.'; end if;
 year_start:=extract(year from now() at time zone (select timezone from public.stayman_properties where id=f.property_id))::integer;
 if extract(month from now() at time zone (select timezone from public.stayman_properties where id=f.property_id))<4 then year_start:=year_start-1; end if;
 fy:=right(year_start::text,2)||right((year_start+1)::text,2);
 insert into public.stayman_invoice_sequences(property_id,financial_year,number) values(f.property_id,fy,1)
 on conflict(property_id,financial_year) do update set number=public.stayman_invoice_sequences.number+1 returning public.stayman_invoice_sequences.number into seq;
 if seq>999999 then raise exception 'Invoice series exhausted.'; end if;
 number:=config->>'invoice_prefix'||'/'||fy||'/'||lpad(seq::text,6,'0');
 update public.stayman_folios set status='ISSUED',invoice_number=number,issued_at=now(),issued_by=auth.uid(),snapshot=preview where id=f.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(f.property_id,f.id,'ISSUED',auth.uid(),jsonb_build_object('invoice_number',number,'total',preview->'total'));
 return number;
end $$;
create or replace function public.stayman_record_folio_payment(p_folio uuid,p_amount bigint,p_method text,p_note text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.stayman_folios; r public.stayman_reservations; paid bigint; applied bigint; existing public.stayman_folio_payments; result uuid;
begin
 select * into r from public.stayman_reservations where id=(select reservation_id from public.stayman_folios where id=p_folio) for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select * into f from public.stayman_folios where id=p_folio for update;
 select * into existing from public.stayman_folio_payments where request_id=p_request;
 if found then
  if existing.folio_id<>p_folio or existing.amount is distinct from p_amount or existing.method is distinct from p_method or existing.note is distinct from coalesce(trim(p_note),'') then raise exception 'Payment request already used with different details.'; end if;
  return existing.id;
 end if;
 select coalesce(sum(amount-accommodation_applied),0) into paid from public.stayman_folio_payments where folio_id=f.id;
 if r.status='CANCELLED' or p_amount is null or p_amount<=0 or p_amount>(public.stayman_folio_preview(r.id)->>'total')::bigint-r.paid_amount-paid then raise exception 'Payment must be positive and no more than the folio balance.'; end if;
 applied:=least(p_amount,greatest(0,r.total_amount-r.paid_amount));
 insert into public.stayman_folio_payments(folio_id,property_id,reservation_id,amount,accommodation_applied,method,note,actor,request_id) values(f.id,r.property_id,r.id,p_amount,applied,p_method,coalesce(trim(p_note),''),auth.uid(),p_request) returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount+applied where id=r.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(f.property_id,f.id,'PAYMENT_RECORDED',auth.uid(),jsonb_build_object('payment_id',result,'amount',p_amount));
 return result;
end $$;
-- Release old review locks; issued snapshots remain untouched.
update public.stayman_folios set status='DRAFT' where status='REVIEW';
revoke all on function public.stayman_checkout_guests(uuid,uuid[],boolean),public.stayman_invoice_context(uuid) from public,anon;
grant execute on function public.stayman_checkout_guests(uuid,uuid[],boolean),public.stayman_invoice_context(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
