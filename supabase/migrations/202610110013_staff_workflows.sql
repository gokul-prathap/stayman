-- Apply after 012. Staff-only actions, paged directory and scoped detail access.
begin;
create table public.stayman_staff_actions (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.stayman_properties(id),
 entity_id uuid not null, action text not null, before_details jsonb, after_details jsonb,
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(), request_id uuid unique
);
alter table public.stayman_staff_actions enable row level security;
revoke all on public.stayman_staff_actions from public,anon,authenticated;
grant select on public.stayman_staff_actions to authenticated;
create policy staff_read on public.stayman_staff_actions for select to authenticated using(public.stayman_is_staff(property_id));
alter table public.guest_checkin_invitations add column staff_name text check(length(trim(staff_name)) between 2 and 100);

create function public.stayman_release_maintenance(p_allocation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.stayman_allocations;
begin
 select * into a from public.stayman_allocations where id=p_allocation for update;
 if not found or not public.stayman_is_staff(a.property_id) then raise exception 'Maintenance not found or staff access required.'; end if;
 if a.status<>'MAINTENANCE' then raise exception 'Only maintenance can be released.'; end if;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,actor)
 values(a.property_id,a.id,'RELEASE_MAINTENANCE',to_jsonb(a),auth.uid());
 delete from public.stayman_allocations where id=a.id;
end $$;

create function public.stayman_rename_guest(p_property uuid,p_kind text,p_id uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Name must have 2 to 100 characters.'; end if;
 case p_kind
 when 'guest' then
 select to_jsonb(g) into previous from public.stayman_guests g where id=p_id and property_id=p_property for update;
 update public.stayman_guests set full_name=trim(p_name) where id=p_id and property_id=p_property;
 update public.stayman_booking_members set display_name=trim(p_name) where guest_id=p_id and property_id=p_property;
 when 'member' then
 select to_jsonb(m) into previous from public.stayman_booking_members m where id=p_id and property_id=p_property for update;
 update public.stayman_booking_members set display_name=trim(p_name) where id=p_id and property_id=p_property;
 when 'walkin' then
 select to_jsonb(i) into previous from public.guest_checkin_invitations i where id=p_id and property_id=p_property and status='completed' for update;
 update public.guest_checkin_invitations set staff_name=trim(p_name) where id=p_id and property_id=p_property and status='completed';
 else raise exception 'Invalid guest type.';
 end case;
 if previous is null then raise exception 'Guest not found.'; end if;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor)
 values(p_property,p_id,'RENAME_'||upper(p_kind),previous,jsonb_build_object('name',trim(p_name)),auth.uid());
end $$;

create function public.stayman_extend_stay(p_reservation uuid,p_target uuid,p_depart date,p_expected_checkout date,p_expected_total bigint,p_expected_extra bigint,p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.stayman_reservations; u public.stayman_units; g public.stayman_guests; extra bigint;
begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not found or not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.'; end if;
 if exists(select 1 from public.stayman_staff_actions where request_id=p_request and entity_id=r.id and action='EXTEND_STAY') then return; end if;
 if p_request is null or p_depart is null or p_depart<=r.check_out_date or r.status not in ('PENDING','CHECKED_IN') then raise exception 'Choose a later checkout for an active booking.'; end if;
 if r.check_out_date<(now() at time zone (select timezone from public.stayman_properties where id=r.property_id))::date then raise exception 'This stay has already ended.'; end if;
 if p_expected_checkout is distinct from r.check_out_date or p_expected_total is distinct from r.total_amount then raise exception 'Reservation changed. Refresh and try again.'; end if;
 select * into u from public.stayman_units where id=p_target and property_id=r.property_id for share;
 if not found then raise exception 'Choose a valid bed or room.'; end if;
 select * into g from public.stayman_guests where id=r.guest_id;
 if (u.gender_policy='FEMALE_ONLY' and g.gender<>'FEMALE') or (u.gender_policy='MALE_ONLY' and g.gender<>'MALE') then raise exception 'Room gender policy does not match.'; end if;
 extra:=u.nightly_rate_paise*(p_depart-r.check_out_date);
 if extra is distinct from p_expected_extra then raise exception 'Rate changed. Refresh and try again.'; end if;
 insert into public.stayman_allocations(property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise)
 values(r.property_id,r.id,u.id,r.check_out_date,p_depart,r.status,extra);
 update public.stayman_reservations set check_out_date=p_depart,total_amount=total_amount+extra where id=r.id;
 update public.guest_checkin_invitations i set expires_at=greatest(i.expires_at,p_depart::timestamp at time zone (select timezone from public.stayman_properties where id=r.property_id))
 where i.status<>'completed' and exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id and m.reservation_id=r.id);
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor,request_id)
 values(r.property_id,r.id,'EXTEND_STAY',to_jsonb(r),jsonb_build_object('check_out_date',p_depart,'extra_paise',extra,'unit_id',u.id),auth.uid(),p_request);
end $$;

create index on public.stayman_reservations(property_id,guest_id,check_in_date);
-- Private summary view: deliberately excludes submitted contact fields and identity JSON.
create view public.stayman_guest_directory_rows as
 select g.property_id,'guest'::text kind,g.id,g.full_name name,g.phone||' '||coalesce(g.email,'')||' '||coalesce((select string_agg(b.booking_ref,' ') from public.stayman_reservations b where b.guest_id=g.id and b.property_id=g.property_id),'') search_contact,
 r.id reservation_id,r.booking_ref,r.check_in_date arrival,r.check_out_date departure,r.status booking_status,
 (select coalesce(bool_or(i.status='completed'),false) from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.guest_id=g.id and m.property_id=g.property_id and m.reservation_id=r.id) web_done
 from public.stayman_guests g left join lateral (
 select * from public.stayman_reservations r where (r.guest_id=g.id or exists(select 1 from public.stayman_booking_members bm where bm.reservation_id=r.id and bm.guest_id=g.id)) and r.property_id=g.property_id
 order by case when r.status in ('PENDING','CHECKED_IN') and r.check_out_date>(now() at time zone (select timezone from public.stayman_properties where id=g.property_id))::date then 0 else 1 end,
 case when r.status in ('PENDING','CHECKED_IN') then r.check_in_date end asc,r.check_in_date desc,r.id limit 1
 ) r on true
 union all
 select m.property_id,'member',m.id,m.display_name,coalesce(i.details->>'phone','')||' '||coalesce(i.details->>'email',''),
 r.id,r.booking_ref,r.check_in_date,r.check_out_date,r.status,i.status='completed'
 from public.stayman_booking_members m join public.stayman_reservations r on r.id=m.reservation_id
 join public.guest_checkin_invitations i on i.id=m.invitation_id where m.guest_id is null
 union all
 select i.property_id,'walkin',i.id,coalesce(i.staff_name,i.details->>'full_name','Guest'),coalesce(i.details->>'phone','')||' '||coalesce(i.details->>'email',''),
 null::uuid,null::text,(i.details->>'arrival_date')::date,(i.details->>'departure_date')::date,null::text,true
 from public.guest_checkin_invitations i where i.source='public_qr' and i.status='completed'
 and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id);
revoke all on public.stayman_guest_directory_rows from public,anon,authenticated;

create function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_page is null or p_page<1 or p_size is null or p_size not in (10,25,50) or length(coalesce(p_search,''))>100 then raise exception 'Invalid pagination.'; end if;
 if p_filter is null or p_filter not in ('all','current','future','past','walkin') or p_checkin is null or p_checkin not in ('all','done','pending') then raise exception 'Invalid filters.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
 with classified as (
 select d.*,case when kind='walkin' then 'walkin'
 when booking_status in ('CANCELLED','CHECKED_OUT') or departure is null or departure<=today then 'past'
 when arrival>today then 'future' else 'current' end stay
 from public.stayman_guest_directory_rows d where property_id=p_property
 ), filtered as (
 select * from classified where (p_filter='all' or stay=p_filter)
 and (p_checkin='all' or web_done=(p_checkin='done'))
 and position(lower(trim(coalesce(p_search,''))) in lower(name||' '||search_contact||' '||coalesce(booking_ref,'')))>0
 ), paged as (
 select kind,id,name,reservation_id,booking_ref,arrival,departure,booking_status,web_done,stay
 from filtered order by lower(name),kind,id limit p_size offset (p_page::bigint-1)*p_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 return result;
end $$;

-- Only called after View. Existing UI can consume this small, scoped data shape.
create function public.stayman_guest_profile(p_property uuid,p_kind text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gids uuid[]; rids uuid[]; result jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_kind not in ('guest','member','walkin') or p_kind is null then raise exception 'Invalid guest type.'; end if;
 select array_agg(r.id) into rids from public.stayman_reservations r where r.property_id=p_property
 and ((p_kind='guest' and (r.guest_id=p_id or exists(select 1 from public.stayman_booking_members bm where bm.reservation_id=r.id and bm.guest_id=p_id))) or (p_kind='member' and exists(select 1 from public.stayman_booking_members m where m.id=p_id and m.reservation_id=r.id)));
 select array_agg(distinct guest_id) into gids from public.stayman_reservations where id=any(rids);
 if p_kind='guest' then gids:=array_append(gids,p_id); end if;
 select jsonb_build_object(
 'guests',coalesce((select jsonb_agg(to_jsonb(g)) from public.stayman_guests g where g.property_id=p_property and g.id=any(gids)),'[]'::jsonb),
 'reservations',coalesce((select jsonb_agg(to_jsonb(r)) from public.stayman_reservations r where r.property_id=p_property and r.id=any(rids)),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('status',i.status,'details',i.details,'completed_at',i.completed_at)) from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id where m.property_id=p_property and m.reservation_id=any(rids)),'[]'::jsonb),
 'walkins',coalesce((select jsonb_agg(to_jsonb(i)) from public.guest_checkin_invitations i where i.property_id=p_property and p_kind='walkin' and i.id=p_id and i.status='completed'),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.stayman_edit_expense(p_expense uuid,p_details jsonb,p_expected jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.stayman_expenses; paid date; today date;
begin
 select * into e from public.stayman_expenses where id=p_expense for update;
 if not found or not public.stayman_is_staff(e.property_id) then raise exception 'Staff access required.'; end if;
 if e.voided_at is not null then raise exception 'Voided expenses cannot be edited.'; end if;
 if p_expected is distinct from (to_jsonb(e)-'created_at') then raise exception 'Expense changed. Refresh and try again.'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or p_reason is null or length(trim(p_reason)) not between 2 and 250 then raise exception 'Complete the details and correction reason.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=e.property_id;
 paid:=nullif(p_details->>'paid_date','')::date;
 if (p_details->>'expense_date')::date>today or paid>today then raise exception 'Expense and payment dates cannot be in the future.'; end if;
 update public.stayman_expenses set category=p_details->>'category',description=trim(p_details->>'description'),vendor=coalesce(trim(p_details->>'vendor'),''),
 amount_paise=(p_details->>'amount_paise')::bigint,expense_date=(p_details->>'expense_date')::date,due_date=nullif(p_details->>'due_date','')::date,
 units_consumed=nullif(p_details->>'units_consumed','')::numeric,paid_date=paid,method=case when paid is not null then p_details->>'method' end where id=e.id;
 insert into public.stayman_expense_events(property_id,expense_id,action,actor,note) values(e.property_id,e.id,'EDITED',auth.uid(),trim(p_reason));
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor)
 values(e.property_id,e.id,'EDIT_EXPENSE',to_jsonb(e),p_details,auth.uid());
end $$;
revoke all on function public.stayman_release_maintenance(uuid),public.stayman_rename_guest(uuid,text,uuid,text),
public.stayman_extend_stay(uuid,uuid,date,date,bigint,bigint,uuid),public.stayman_guest_directory(uuid,text,text,text,integer,integer),
public.stayman_guest_profile(uuid,text,uuid),public.stayman_edit_expense(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.stayman_release_maintenance(uuid),public.stayman_rename_guest(uuid,text,uuid,text),
public.stayman_extend_stay(uuid,uuid,date,date,bigint,bigint,uuid),public.stayman_guest_directory(uuid,text,text,text,integer,integer),
public.stayman_guest_profile(uuid,text,uuid),public.stayman_edit_expense(uuid,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
