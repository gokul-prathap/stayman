-- Apply after 025, before deploying the matching client. Read-only, staff scoped.
-- Safe to rerun: replace matching RPC definitions and retain existing indexes.
begin;

create or replace function public.stayman_checkin_notifications(p_property uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date; result jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
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
 ), walkins as (
  select i.id,jsonb_build_object('full_name',i.details->>'full_name','document_screening',i.details->'document_screening') as details
  from public.guest_checkin_invitations i where i.property_id=p_property and i.source='public_qr' and i.status='completed'
   and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id)
 )
 select jsonb_build_object(
  'revision',md5(
   coalesce((select jsonb_agg(jsonb_build_array(r.id,r.status,r.check_in_date,r.check_out_date,r.total_amount,r.paid_amount) order by r.id)::text from public.stayman_reservations r where r.property_id=p_property and (r.check_out_date>=today or r.created_at>=(today-1)::timestamp at time zone (select timezone from public.stayman_properties where id=p_property))),'')||
   coalesce((select p.paid_at::text from public.stayman_payments p where p.property_id=p_property order by p.paid_at desc limit 1),'')||
   coalesce((select p.paid_at::text from public.stayman_folio_payments p where p.property_id=p_property order by p.paid_at desc limit 1),'')||
   coalesce((select jsonb_agg(jsonb_build_array(i.id,i.clean,i.dirty,i.laundry,i.low_stock) order by i.id)::text from public.stayman_stock_items i where i.property_id=p_property),'')||
   coalesce((select jsonb_agg(jsonb_build_array(e.id,e.amount_paise,e.paid_date,e.voided_at) order by e.id)::text from public.stayman_expenses e where e.property_id=p_property and (e.expense_date>=today-6 or e.paid_date>=today-6 or e.paid_date is null)),'')
  ),
  'count',(select count(*) from pending where check_in_date<=today)+(select count(*) from walkins),
  'due',coalesce((select jsonb_agg(to_jsonb(p) order by check_in_date,id) from (select * from pending where check_in_date<=today order by check_in_date,id limit 100) p),'[]'::jsonb),
  'upcoming',coalesce((select jsonb_agg(to_jsonb(p) order by check_in_date,id) from (select * from pending where check_in_date>today order by check_in_date,id limit 100) p),'[]'::jsonb),
  'upcoming_count',(select count(*) from pending where check_in_date>today),
  'walkins',coalesce((select jsonb_agg(to_jsonb(w) order by id) from (select * from walkins order by id limit 100) w),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.stayman_workspace_data(p_property uuid,p_mode text default 'window',p_from date default current_date,p_to date default current_date+30,
 p_reservation uuid default null,p_page integer default 1,p_size integer default 25,p_search text default '',p_filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rids uuid[]; today date; zone text; start_day date:=p_from; end_day date:=p_to; total bigint:=0; result jsonb; active_booking boolean:=false;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_mode is null or p_mode not in ('window','dashboard','inventory','reservation','booking','availability','list','refunds') then raise exception 'Invalid workspace view.'; end if;
 select timezone,(now() at time zone timezone)::date into zone,today from public.stayman_properties where id=p_property;
 if p_mode='reservation' then
  select check_in_date,check_out_date,status in ('PENDING','CHECKED_IN') into start_day,end_day,active_booking from public.stayman_reservations where id=p_reservation and property_id=p_property;
  if not found then raise exception 'Reservation unavailable.'; end if;
 elsif p_from is null or p_to is null or p_to<p_from or p_to-p_from>732 then raise exception 'Choose a valid date range of up to 733 days.';
 end if;
 if p_page is null or p_page<1 or p_page>100000 or p_size is null or p_size not between 1 and 50 or length(coalesce(p_search,''))>100 then raise exception 'Invalid page or search.'; end if;

 if p_mode='list' then
  if p_filter not in ('all','current','future','past') then raise exception 'Invalid reservation filter.'; end if;
  select count(*) into total from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id
   where r.property_id=p_property
    and (coalesce(p_search,'')='' or g.full_name ilike '%'||p_search||'%' or g.phone ilike '%'||p_search||'%' or g.email ilike '%'||p_search||'%' or r.booking_ref ilike '%'||p_search||'%')
    and (p_filter='all' or (r.status<>'CANCELLED' and case p_filter when 'current' then r.status<>'CHECKED_OUT' and r.check_in_date<=today and r.check_out_date>today when 'future' then r.status<>'CHECKED_OUT' and r.check_in_date>today else r.status='CHECKED_OUT' or r.check_out_date<=today end));
  select coalesce(array_agg(id),'{}'::uuid[]) into rids from (
   select r.id from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id where r.property_id=p_property
    and (coalesce(p_search,'')='' or g.full_name ilike '%'||p_search||'%' or g.phone ilike '%'||p_search||'%' or g.email ilike '%'||p_search||'%' or r.booking_ref ilike '%'||p_search||'%')
    and (p_filter='all' or (r.status<>'CANCELLED' and case p_filter when 'current' then r.status<>'CHECKED_OUT' and r.check_in_date<=today and r.check_out_date>today when 'future' then r.status<>'CHECKED_OUT' and r.check_in_date>today else r.status='CHECKED_OUT' or r.check_out_date<=today end))
    order by r.created_at desc,r.id limit p_size offset (p_page-1)*p_size
  ) page;
 elsif p_mode='refunds' then
  select coalesce(array_agg(r.id),'{}'::uuid[]) into rids from public.stayman_reservations r where r.property_id=p_property
   and ((r.status='CANCELLED' and r.paid_amount>0) or r.paid_amount>r.total_amount
    or exists(select 1 from public.stayman_payments p where p.reservation_id=r.id and p.kind='REFUND' and
     (p.paid_at>=start_day::timestamp at time zone zone and p.paid_at<(end_day+1)::timestamp at time zone zone
      or (r.cancelled_at>=start_day::timestamp at time zone zone and r.cancelled_at<(end_day+1)::timestamp at time zone zone))));
 elsif p_mode in ('inventory','booking','availability') then rids:='{}'::uuid[];
 elsif p_mode='reservation' then rids:=array[p_reservation];
 else
  select coalesce(array_agg(r.id),'{}'::uuid[]) into rids from public.stayman_reservations r where r.property_id=p_property
   and ((r.check_in_date<=end_day and r.check_out_date>=start_day)
    or exists(select 1 from public.stayman_allocations a where a.reservation_id=r.id and a.check_in_date<=end_day and a.check_out_date>start_day));
 end if;

 select jsonb_build_object(
  'total',total,
  'units',coalesce((select jsonb_agg(to_jsonb(u) order by room_name,label) from public.stayman_units u where u.property_id=p_property),'[]'::jsonb),
  'reservations',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from public.stayman_reservations r where r.property_id=p_property and r.id=any(rids)),'[]'::jsonb),
  'guests',coalesce((select jsonb_agg(to_jsonb(g)) from public.stayman_guests g where g.property_id=p_property and exists(select 1 from public.stayman_reservations r where r.id=any(rids) and r.guest_id=g.id)),'[]'::jsonb),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.stayman_allocations a where a.property_id=p_property and p_mode<>'inventory'
   and (a.reservation_id=any(rids) or (p_mode not in ('list','refunds') and (p_mode<>'reservation' or active_booking) and a.check_in_date<=end_day and a.check_out_date>start_day))),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p)) from public.stayman_payments p where p.property_id=p_property and p_mode in ('window','dashboard','reservation','refunds') and
   (case when p_mode='reservation' then p.reservation_id=p_reservation when p_mode='refunds' then p.reservation_id=any(rids) else p.paid_at>=start_day::timestamp at time zone zone and p.paid_at<(end_day+1)::timestamp at time zone zone end)),'[]'::jsonb),
  -- Some deployed billing schemas store the reservation link only on the folio.
  'folio_payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('reservation_id',f.reservation_id))
   from public.stayman_folio_payments p join public.stayman_folios f on f.id=p.folio_id and f.property_id=p.property_id
   where p.property_id=p_property and p_mode in ('window','dashboard','reservation') and
   (case when p_mode='reservation' then f.reservation_id=p_reservation else p.paid_at>=start_day::timestamp at time zone zone and p.paid_at<(end_day+1)::timestamp at time zone zone end)),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(case when p_mode='reservation' then to_jsonb(m)||jsonb_build_object('status',i.status,'details',i.details,'completed_at',i.completed_at)
   else jsonb_build_object('id',m.id,'reservation_id',m.reservation_id,'guest_id',m.guest_id,'status',i.status) end)
   from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.property_id=p_property and m.reservation_id=any(rids)),'[]'::jsonb),
  'walkins',case when p_mode in ('reservation','booking') then coalesce((select jsonb_agg(to_jsonb(w)) from public.stayman_walkins(p_property) w),'[]'::jsonb) else '[]'::jsonb end,
  'isOwner',case when p_mode='inventory' then public.stayman_is_owner(p_property) else false end,
  'team',case when p_mode='inventory' then coalesce((select jsonb_agg(to_jsonb(t)) from public.stayman_team(p_property) t),'[]'::jsonb) else '[]'::jsonb end,
  'pendingRefund',case when p_mode='dashboard' then (select coalesce(sum(case when status='CANCELLED' then paid_amount else greatest(0,paid_amount-total_amount) end),0) from public.stayman_reservations where property_id=p_property) else 0 end,
  'operations',case when p_mode='dashboard' then jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(i)) from public.stayman_stock_items i where property_id=p_property),'[]'::jsonb),
   'costs',(select jsonb_build_object('incurred',coalesce(sum(amount_paise) filter(where expense_date between today-6 and today),0),'paid',coalesce(sum(amount_paise) filter(where paid_date between today-6 and today),0),'unpaid',coalesce(sum(amount_paise) filter(where paid_date is null and expense_date<=today),0)) from public.stayman_expenses where property_id=p_property and voided_at is null)
  ) else null end,
  'activities',case when p_mode='dashboard' then coalesce((select jsonb_agg(to_jsonb(v) order by date desc,id) from (
   select * from (
    (select r.id,r.created_at as date,'Reservation created'::text as title,g.full_name as detail,null::bigint as amount from public.stayman_reservations r join public.stayman_guests g on g.id=r.guest_id where r.property_id=p_property order by r.created_at desc limit 4)
    union all
    (select p.id,p.paid_at,case when p.kind='REFUND' then 'Refund recorded' else 'Payment recorded' end,null::text,p.amount_paise from public.stayman_payments p where p.property_id=p_property order by p.paid_at desc limit 4)
    union all
    (select p.id,p.paid_at,'Payment recorded',null::text,p.amount from public.stayman_folio_payments p where p.property_id=p_property order by p.paid_at desc limit 4)
   ) recent order by date desc,id limit 4
  ) v),'[]'::jsonb) else '[]'::jsonb end
 ) into result;
 return result;
end $$;

create or replace function public.stayman_operations_data(p_property uuid,p_mode text,p_from date,p_to date,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_mode is null or p_mode not in ('stock','expenses') or p_page is null or p_page<1 or p_page>100000 or p_from is null or p_to is null or p_to<p_from then raise exception 'Invalid operations view.'; end if;
 return jsonb_build_object(
  'isOwner',public.stayman_is_owner(p_property),
  'items',case when p_mode='stock' then coalesce((select jsonb_agg(to_jsonb(i) order by name) from public.stayman_stock_items i where property_id=p_property),'[]'::jsonb) else '[]'::jsonb end,
  'movements',case when p_mode='stock' then coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc,id) from (select * from public.stayman_stock_movements where property_id=p_property order by created_at desc,id limit 50) m),'[]'::jsonb) else '[]'::jsonb end,
  'expenses',case when p_mode='expenses' then coalesce((select jsonb_agg(to_jsonb(e) order by expense_date desc,created_at desc,id) from (select * from public.stayman_expenses where property_id=p_property and expense_date between p_from and p_to order by expense_date desc,created_at desc,id limit 25 offset (p_page-1)*25) e),'[]'::jsonb) else '[]'::jsonb end,
  'total',case when p_mode='expenses' then (select count(*) from public.stayman_expenses where property_id=p_property and expense_date between p_from and p_to) else 0 end,
  'summary',case when p_mode='expenses' then (select jsonb_build_object(
   'incurred',coalesce(sum(amount_paise) filter(where expense_date between p_from and p_to),0),
   'paid',coalesce(sum(amount_paise) filter(where paid_date between p_from and p_to),0),
   'unpaid',coalesce(sum(amount_paise) filter(where paid_date is null and expense_date<=p_to),0),
   'units',coalesce(sum(units_consumed) filter(where category='ELECTRICITY' and expense_date between p_from and p_to),0)
  ) from public.stayman_expenses where property_id=p_property and voided_at is null) else null end
 );
end $$;

revoke all on function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text),public.stayman_checkin_notifications(uuid),public.stayman_operations_data(uuid,text,date,date,integer) from public,anon;
grant execute on function public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text),public.stayman_checkin_notifications(uuid),public.stayman_operations_data(uuid,text,date,date,integer) to authenticated;
create index if not exists stayman_reservations_property_dates on public.stayman_reservations(property_id,check_out_date,check_in_date);
create index if not exists stayman_reservations_property_recent on public.stayman_reservations(property_id,created_at desc,id);
create index if not exists stayman_allocations_reservation on public.stayman_allocations(reservation_id);
commit;
