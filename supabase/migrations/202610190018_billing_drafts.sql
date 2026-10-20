begin;
create table public.stayman_billing_profiles(
 property_id uuid primary key references public.stayman_properties(id),
 settings jsonb not null default '{"registration":"UNCONFIGURED","price_mode":"INCLUSIVE","invoice_prefix":"INV","catalog":{}}',
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.stayman_folios(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.stayman_properties(id),
 reservation_id uuid not null unique,status text not null default 'DRAFT' check(status in ('DRAFT','REVIEW','ISSUED')),
 bill_to jsonb not null default '{}',prepared_at timestamptz,prepared_by uuid references auth.users(id),
 prepared_source jsonb,invoice_number text,issued_at timestamptz,issued_by uuid references auth.users(id),snapshot jsonb,
 foreign key(reservation_id,property_id) references public.stayman_reservations(id,property_id),unique(property_id,invoice_number)
);
create table public.stayman_folio_charges(
 id uuid primary key default gen_random_uuid(),folio_id uuid not null references public.stayman_folios(id),
 property_id uuid not null references public.stayman_properties(id),category text not null
 check(category in ('EARLY_CHECKIN','TOWEL','SOAP','TOOTHBRUSH','LOCKER','LOCK_PENALTY','DAMAGE_PENALTY','OTHER')),
 description text not null check(length(trim(description)) between 2 and 150),
 quantity integer not null check(quantity between 1 and 10000),unit_amount bigint not null check(unit_amount between 1 and 100000000),
 note text not null default '' check(length(note)<=250),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 request_id uuid not null unique,voided_at timestamptz,voided_by uuid references auth.users(id),void_reason text
);
create index on public.stayman_folio_charges(folio_id);
create table public.stayman_billing_events(
 id uuid primary key default gen_random_uuid(),property_id uuid not null references public.stayman_properties(id),folio_id uuid references public.stayman_folios(id),
 action text not null,actor uuid not null references auth.users(id),details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.stayman_invoice_sequences(property_id uuid references public.stayman_properties(id),financial_year text,number integer not null,primary key(property_id,financial_year));
create table public.stayman_folio_payments(
 id uuid primary key default gen_random_uuid(),folio_id uuid not null references public.stayman_folios(id),property_id uuid not null references public.stayman_properties(id),
 reservation_id uuid not null references public.stayman_reservations(id),accommodation_applied bigint not null default 0,
 amount bigint not null check(amount>0),method text not null check(method in ('CASH','UPI','CARD','BANK')),note text not null default '' check(length(note)<=250),
 actor uuid not null references auth.users(id),paid_at timestamptz not null default now(),request_id uuid not null unique,
 check(accommodation_applied>=0 and accommodation_applied<=amount)
);
create index on public.stayman_folio_payments(folio_id);
create index on public.stayman_folio_payments(property_id,paid_at);
create index on public.stayman_billing_events(folio_id,created_at);
do $$ declare t text; begin
 foreach t in array array['stayman_billing_profiles','stayman_folios','stayman_folio_charges','stayman_billing_events','stayman_folio_payments','stayman_invoice_sequences'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  if t<>'stayman_invoice_sequences' then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy billing_read on public.%I for select to authenticated using(public.stayman_is_staff(property_id) or public.stayman_is_platform_admin())',t);
  end if;
 end loop;
end $$;

create function public.stayman_billing_profile(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (public.stayman_is_staff(p_property) or public.stayman_is_platform_admin()) then raise exception 'Property access required.'; end if;
 return coalesce((select settings from public.stayman_billing_profiles where property_id=p_property),'{"registration":"UNCONFIGURED","price_mode":"INCLUSIVE","invoice_prefix":"INV","catalog":{}}'::jsonb);
end $$;

create function public.stayman_save_billing_profile(p_property uuid,p_settings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; kind text; rates integer[]; prior jsonb;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 if p_settings is null or octet_length(p_settings::text)>32768 or jsonb_typeof(p_settings)<>'object' or coalesce(p_settings->>'registration','') not in ('UNCONFIGURED','NOT_REGISTERED','REGISTERED')
 or coalesce(p_settings->>'price_mode','') not in ('INCLUSIVE','EXCLUSIVE')
 or coalesce(p_settings->>'invoice_prefix','') !~ '^[A-Z0-9]{1,4}$'
 or coalesce(length(trim(p_settings->>'legal_name')),0) not between 2 and 100
 or coalesce(length(trim(p_settings->>'billing_address')),0) not between 2 and 500
 or coalesce(length(p_settings->>'email'),0)>254 or coalesce(jsonb_typeof(p_settings->'catalog'),'')<>'object' then raise exception 'Complete the legal name, billing address and valid billing settings.'; end if;
 if p_settings->>'registration'='REGISTERED' and coalesce(p_settings->>'gstin','') !~ '^[0-9]{2}[A-Z0-9]{13}$' then raise exception 'Enter the confirmed 15-character GSTIN.'; end if;
 foreach kind in array array['ACCOMMODATION','EARLY_CHECKIN','TOWEL','SOAP','TOOTHBRUSH','LOCKER','LOCK_PENALTY','DAMAGE_PENALTY','OTHER'] loop
  item:=p_settings->'catalog'->kind;
  if item is null or jsonb_typeof(item)<>'object' or coalesce(item->>'cgst_bps','') !~ '^[0-9]{1,5}$' or coalesce(item->>'sgst_bps','') !~ '^[0-9]{1,5}$' or coalesce(item->>'igst_bps','') !~ '^[0-9]{1,5}$'
  or coalesce(item->>'sac','') !~ '^[0-9]{0,8}$' then raise exception 'Set the tax classification and rates for each charge category.'; end if;
  rates:=array[(item->>'cgst_bps')::integer,(item->>'sgst_bps')::integer,(item->>'igst_bps')::integer];
  if rates[1]>10000 or rates[2]>10000 or rates[3]>10000 or (rates[3]>0 and rates[1]+rates[2]>0) then raise exception 'Invalid GST rates. IGST cannot be combined with CGST/SGST on the same charge.'; end if;
  if p_settings->>'registration'='REGISTERED' and kind='ACCOMMODATION' and coalesce(item->>'sac','')='' then raise exception 'Confirm accommodation HSN/SAC before enabling GST billing.'; end if;
 end loop;
 select settings into prior from public.stayman_billing_profiles where property_id=p_property for update;
 insert into public.stayman_billing_profiles(property_id,settings,updated_by) values(p_property,p_settings,auth.uid())
 on conflict(property_id) do update set settings=excluded.settings,updated_at=now(),updated_by=auth.uid();
 insert into public.stayman_billing_events(property_id,action,actor,details) values(p_property,'PROFILE_UPDATED',auth.uid(),jsonb_build_object('before',prior,'after',p_settings));
end $$;

-- Physical settings are no longer writable by owner/manager accounts.
create or replace function public.stayman_save_settings(p_property uuid,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin raise exception 'Property profile is managed by the platform administrator.'; end $$;

create function public.stayman_calculate_bill_line(p_amount bigint,p_rate jsonb,p_mode text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare base bigint; cg bigint; sg bigint; ig bigint; c integer:=coalesce((p_rate->>'cgst_bps')::integer,0); s integer:=coalesce((p_rate->>'sgst_bps')::integer,0); i integer:=coalesce((p_rate->>'igst_bps')::integer,0); adjustment bigint;
begin
 base:=case when p_mode='INCLUSIVE' then round(p_amount::numeric*10000/(10000+c+s+i))::bigint else p_amount end;
 cg:=round(base::numeric*c/10000)::bigint;sg:=round(base::numeric*s/10000)::bigint;ig:=round(base::numeric*i/10000)::bigint;
 adjustment:=case when p_mode='INCLUSIVE' then p_amount-base-cg-sg-ig else 0 end;
 return jsonb_build_object('taxable',base,'cgst',cg,'sgst',sg,'igst',ig,'adjustment',adjustment,'total',base+cg+sg+ig+adjustment,'sac',coalesce(p_rate->>'sac',''),'rates',p_rate);
end $$;
revoke all on function public.stayman_calculate_bill_line(bigint,jsonb,text) from public,anon,authenticated;

create function public.stayman_folio_preview(p_reservation uuid) returns jsonb
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
 'rooms',(select coalesce(jsonb_agg(jsonb_build_object('room',u.room_name,'unit',u.label,'from',a.check_in_date,'to',a.check_out_date) order by a.check_in_date),'[]') from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id where a.reservation_id=r.id),
 'bill_to',coalesce(f.bill_to,'{}'::jsonb),'lines',lines,'taxable',taxable,'cgst',cg,'sgst',sg,'igst',ig,'adjustment',adjustment,'total',total,'net_paid',r.paid_amount+extras_paid,'balance',total-r.paid_amount-extras_paid,'payments',payments);
end $$;

create function public.stayman_add_folio_charge(p_reservation uuid,p_category text,p_description text,p_quantity integer,p_amount bigint,p_note text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; f public.stayman_folios; prior public.stayman_folio_charges; result uuid;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 select * into prior from public.stayman_folio_charges where request_id=p_request;
 if found then
  if prior.property_id<>r.property_id or not exists(select 1 from public.stayman_folios where id=prior.folio_id and reservation_id=r.id) or prior.category is distinct from p_category or prior.description is distinct from trim(p_description) or prior.quantity is distinct from p_quantity or prior.unit_amount is distinct from p_amount or prior.note is distinct from coalesce(trim(p_note),'') then raise exception 'Request was already used with different charge details.'; end if;
  return prior.id;
 end if;
 if r.status='CANCELLED' then raise exception 'Cannot add charges to a cancelled booking.'; end if;
 insert into public.stayman_folios(property_id,reservation_id) values(r.property_id,r.id) on conflict(reservation_id) do nothing;
 select * into f from public.stayman_folios where reservation_id=r.id for update;
 if f.status<>'DRAFT' then raise exception 'This folio is submitted or issued. Ask the administrator to return the draft before editing.'; end if;
 if p_category in ('LOCK_PENALTY','DAMAGE_PENALTY') and coalesce(length(trim(p_note)),0)<3 then raise exception 'Explain the penalty before adding it.'; end if;
 insert into public.stayman_folio_charges(folio_id,property_id,category,description,quantity,unit_amount,note,created_by,request_id)
 values(f.id,r.property_id,p_category,trim(p_description),p_quantity,p_amount,coalesce(trim(p_note),''),auth.uid(),p_request) returning id into result;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(r.property_id,f.id,'CHARGE_ADDED',auth.uid(),jsonb_build_object('charge_id',result));
 return result;
end $$;

create function public.stayman_void_folio_charge(p_charge uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.stayman_folio_charges; f public.stayman_folios;
begin
 select * into c from public.stayman_folio_charges where id=p_charge;
 if not found or not public.stayman_is_staff(c.property_id) then raise exception 'Staff access required.'; end if;
 perform 1 from public.stayman_reservations where id=(select reservation_id from public.stayman_folios where id=c.folio_id) for update;
 select * into f from public.stayman_folios where id=c.folio_id for update;
 if f.status<>'DRAFT' or coalesce(length(trim(p_reason)),0) not between 3 and 250 then raise exception 'Only draft charges can be voided, with a reason.'; end if;
 if c.voided_at is not null then return; end if;
 update public.stayman_folio_charges set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=c.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(c.property_id,f.id,'CHARGE_VOIDED',auth.uid(),jsonb_build_object('charge_id',c.id,'reason',trim(p_reason)));
end $$;

create function public.stayman_prepare_folio(p_reservation uuid,p_bill_to jsonb) returns uuid
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
 if f.status<>'DRAFT' then raise exception 'This invoice has already been submitted or issued.'; end if;
 update public.stayman_folios set bill_to=jsonb_build_object('name',trim(p_bill_to->>'name'),'address',coalesce(trim(p_bill_to->>'address'),''),'gstin',coalesce(p_bill_to->>'gstin','')) where id=f.id;
 preview:=public.stayman_folio_preview(r.id);
 update public.stayman_folios set status='REVIEW',prepared_at=now(),prepared_by=auth.uid(),prepared_source=preview where id=f.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor) values(r.property_id,f.id,'SUBMITTED',auth.uid());
 return f.id;
end $$;

create function public.stayman_admin_folio_queue() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'reservation_id',f.reservation_id,'status',f.status,'prepared_at',f.prepared_at,'property_name',p.name,'reference',r.booking_ref,'guest',g.full_name,'invoice_number',f.invoice_number) order by f.prepared_at desc)
 from public.stayman_folios f join public.stayman_properties p on p.id=f.property_id join public.stayman_reservations r on r.id=f.reservation_id join public.stayman_guests g on g.id=r.guest_id where f.status in ('REVIEW','ISSUED')),'[]');
end $$;

create function public.stayman_issue_folio(p_folio uuid,p_expected jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare f public.stayman_folios; preview jsonb; config jsonb; year_start integer; fy text; seq integer; number text;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 perform 1 from public.stayman_reservations where id=(select reservation_id from public.stayman_folios where id=p_folio) for update;
 select * into f from public.stayman_folios where id=p_folio for update;
 if not found then raise exception 'Folio not found.'; end if;
 if f.status='ISSUED' then return f.invoice_number; end if;
 if f.status<>'REVIEW' then raise exception 'Staff must submit a draft first.'; end if;
 perform 1 from public.stayman_billing_profiles where property_id=f.property_id for share;
 preview:=public.stayman_folio_preview(f.reservation_id);config:=preview->'settings';
 if coalesce(config->>'registration','UNCONFIGURED')='UNCONFIGURED' then raise exception 'Confirm this property registration and billing configuration before issuing.'; end if;
 if config->>'registration'='REGISTERED' and exists(select 1 from jsonb_array_elements(preview->'lines') line where coalesce(line->>'sac','')='') then raise exception 'Confirm HSN/SAC for each charge used on this invoice.'; end if;
 if config->>'registration'='REGISTERED' and coalesce(length(trim(f.bill_to->>'address')),0)<2 then raise exception 'Enter the customer billing address before issuing a GST invoice.'; end if;
 if preview->'booking' is distinct from f.prepared_source->'booking' then raise exception 'The booking changed after preparation. Return the draft for staff to prepare again.'; end if;
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

create function public.stayman_return_folio(p_folio uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.stayman_folios;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 if coalesce(length(trim(p_reason)),0) not between 3 and 250 then raise exception 'Provide a return reason.'; end if;
 perform 1 from public.stayman_reservations where id=(select reservation_id from public.stayman_folios where id=p_folio) for update;
 select * into f from public.stayman_folios where id=p_folio for update;
 if f.status<>'REVIEW' then raise exception 'Only submitted drafts can be returned.'; end if;
 update public.stayman_folios set status='DRAFT' where id=f.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(f.property_id,f.id,'RETURNED',auth.uid(),jsonb_build_object('reason',trim(p_reason)));
end $$;

create function public.stayman_issued_booking_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.total_amount is distinct from old.total_amount or new.check_in_date is distinct from old.check_in_date or new.check_out_date is distinct from old.check_out_date or (new.status='CANCELLED' and old.status<>'CANCELLED'))
 and exists(select 1 from public.stayman_folios where reservation_id=old.id and status='ISSUED') then raise exception 'An issued invoice exists. Contact the platform administrator for a billing correction before changing charges or dates.'; end if;
 return new;
end $$;
create trigger issued_booking_guard before update on public.stayman_reservations for each row execute function public.stayman_issued_booking_guard();
revoke all on function public.stayman_issued_booking_guard() from public,anon,authenticated;

-- All money remains bookkeeping only. Additional receipts settle the issued
-- folio; accommodation receipts keep their existing ledger and charge basis.
create function public.stayman_record_folio_payment(p_folio uuid,p_amount bigint,p_method text,p_note text,p_request uuid) returns uuid
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
 if f.status<>'ISSUED' or r.status='CANCELLED' or p_amount is null or p_amount<=0 or p_amount>(f.snapshot->>'total')::bigint-r.paid_amount-paid then raise exception 'Payment must be positive and no more than the issued folio balance.'; end if;
 applied:=least(p_amount,greatest(0,r.total_amount-r.paid_amount));
 insert into public.stayman_folio_payments(folio_id,property_id,reservation_id,amount,accommodation_applied,method,note,actor,request_id) values(f.id,r.property_id,r.id,p_amount,applied,p_method,coalesce(trim(p_note),''),auth.uid(),p_request) returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount+applied where id=r.id;
 insert into public.stayman_billing_events(property_id,folio_id,action,actor,details) values(f.property_id,f.id,'PAYMENT_RECORDED',auth.uid(),jsonb_build_object('payment_id',result,'amount',p_amount));
 return result;
end $$;

alter function public.stayman_record_payment(uuid,bigint,text,text,uuid) rename to stayman_record_accommodation_payment;
revoke all on function public.stayman_record_accommodation_payment(uuid,bigint,text,text,uuid) from public,anon,authenticated;
create function public.stayman_record_payment(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; f public.stayman_folios; additional bigint;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if not exists(select 1 from public.stayman_payments where request_id=p_request) then
  select * into f from public.stayman_folios where reservation_id=r.id and status='ISSUED';
  if found then
   select coalesce(sum(amount-accommodation_applied),0) into additional from public.stayman_folio_payments where folio_id=f.id;
   if p_amount>(f.snapshot->>'total')::bigint-r.paid_amount-additional then raise exception 'Payment exceeds the remaining folio balance.'; end if;
  end if;
 end if;
 return public.stayman_record_accommodation_payment(p_reservation,p_amount,p_method,p_note,p_request);
end $$;

revoke all on function public.stayman_billing_profile(uuid),public.stayman_save_billing_profile(uuid,jsonb),public.stayman_folio_preview(uuid),public.stayman_add_folio_charge(uuid,text,text,integer,bigint,text,uuid),public.stayman_void_folio_charge(uuid,text),public.stayman_prepare_folio(uuid,jsonb),public.stayman_admin_folio_queue(),public.stayman_issue_folio(uuid,jsonb),public.stayman_return_folio(uuid,text),public.stayman_record_folio_payment(uuid,bigint,text,text,uuid),public.stayman_record_payment(uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.stayman_billing_profile(uuid),public.stayman_save_billing_profile(uuid,jsonb),public.stayman_folio_preview(uuid),public.stayman_add_folio_charge(uuid,text,text,integer,bigint,text,uuid),public.stayman_void_folio_charge(uuid,text),public.stayman_prepare_folio(uuid,jsonb),public.stayman_admin_folio_queue(),public.stayman_issue_folio(uuid,jsonb),public.stayman_return_folio(uuid,text),public.stayman_record_folio_payment(uuid,bigint,text,text,uuid),public.stayman_record_payment(uuid,bigint,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
