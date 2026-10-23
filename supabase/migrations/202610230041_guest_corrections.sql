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
