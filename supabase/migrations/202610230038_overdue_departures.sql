-- Overdue is a derived flag, never an automatic checkout/payment change.
-- Extends the existing shared notification request, with capped lists and full counts.
begin;
create index if not exists stayman_open_departures on public.stayman_reservations(property_id,check_out_date,id) where status in ('PENDING','CHECKED_IN');
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
  select i.id,jsonb_build_object('full_name',i.details->>'full_name','document_screening',i.details->'document_screening','departure_date',i.details->>'departure_date') as details,
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
