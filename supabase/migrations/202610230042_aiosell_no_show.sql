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
