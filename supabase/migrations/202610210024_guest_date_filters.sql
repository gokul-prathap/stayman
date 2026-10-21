begin;
-- Date bounds are inclusive and applied before counting and pagination.
drop function public.stayman_guest_directory(uuid,text,text,text,integer,integer);
drop function public.stayman_guest_directory_basic(uuid,text,text,text,integer,integer);
create function public.stayman_guest_directory_basic(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 if p_page is null or p_page<1 or p_size is null or p_size not in (10,25,50) or length(coalesce(p_search,''))>100 then raise exception 'Invalid pagination.'; end if;
 if p_filter is null or p_filter not in ('all','current','future','past','walkin') or p_checkin is null or p_checkin not in ('all','done','pending') then raise exception 'Invalid filters.'; end if;
 if p_date_field is null or p_date_field not in ('arrival','departure') then raise exception 'Invalid date filter.'; end if;
 if p_date_from>p_date_to then raise exception 'From date must be on or before To date.'; end if;
 select (now() at time zone timezone)::date into today from public.stayman_properties where id=p_property;
 with classified as (
 select d.*,case when kind='walkin' then 'walkin'
 when booking_status in ('CANCELLED','CHECKED_OUT') or departure is null or departure<=today then 'past'
 when arrival>today then 'future' else 'current' end stay
 from public.stayman_guest_directory_rows d where property_id=p_property
 ), filtered as (
 select * from classified where (p_filter='all' or stay=p_filter)
 and (p_date_from is null or (case when p_date_field='arrival' then arrival else departure end)>=p_date_from)
 and (p_date_to is null or (case when p_date_field='arrival' then arrival else departure end)<=p_date_to)
 and (p_checkin='all' or web_done=(p_checkin='done'))
 and position(lower(trim(coalesce(p_search,''))) in lower(name||' '||search_contact||' '||coalesce(booking_ref,'')))>0
 ), paged as (
 select kind,id,name,reservation_id,booking_ref,arrival,departure,booking_status,web_done,stay
 from filtered order by lower(name),kind,id limit p_size offset (p_page::bigint-1)*p_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 return result;
end $$;
create function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; entry jsonb; rows jsonb:='[]'::jsonb; submission jsonb; contact public.stayman_guests; booking public.stayman_reservations; rooms jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 result:=public.stayman_guest_directory_basic(p_property,p_search,p_filter,p_checkin,p_page,p_size,p_date_from,p_date_to,p_date_field);
 for entry in select value from jsonb_array_elements(result->'rows') loop
  contact:=null;booking:=null;submission:=null;rooms:='[]'::jsonb;
  if entry->>'kind'='guest' then
   select * into contact from public.stayman_guests where property_id=p_property and id=(entry->>'id')::uuid;
  end if;
  if entry->>'reservation_id' is not null then
   select * into booking from public.stayman_reservations where property_id=p_property and id=(entry->>'reservation_id')::uuid;
   select coalesce(jsonb_agg(jsonb_build_object('room',u.room_name,'unit',u.label,'from',a.check_in_date,'to',a.check_out_date) order by a.check_in_date,u.room_name,u.label),'[]'::jsonb)
   into rooms from public.stayman_allocations a join public.stayman_units u on u.id=a.unit_id and u.property_id=a.property_id
   where a.property_id=p_property and a.reservation_id=booking.id;
  end if;
  if entry->>'kind'='walkin' then
   select details into submission from public.guest_checkin_invitations where property_id=p_property and id=(entry->>'id')::uuid and status='completed';
  else
   select i.details into submission from public.stayman_booking_members m join public.guest_checkin_invitations i on i.id=m.invitation_id
   where m.property_id=p_property and m.reservation_id=(entry->>'reservation_id')::uuid
    and ((entry->>'kind'='member' and m.id=(entry->>'id')::uuid) or (entry->>'kind'='guest' and m.guest_id=(entry->>'id')::uuid))
   order by (i.status='completed') desc,m.created_at desc,m.id limit 1;
  end if;
  rows:=rows||jsonb_build_array(entry||jsonb_build_object(
   'phone',coalesce(nullif(submission->>'phone',''),contact.phone,''),
   'email',coalesce(nullif(submission->>'email',''),contact.email,''),
   'nationality',coalesce(contact.nationality,''),'source',booking.source,
   'coming_from',coalesce(submission->>'coming_from',''),'going_to',coalesce(submission->>'going_to',''),
   'document_screening',submission->'document_screening','rooms',rooms,
   'total_amount',booking.total_amount,'paid_amount',booking.paid_amount));
 end loop;
 return jsonb_set(result,'{rows}',rows);
end $$;
revoke all on function public.stayman_guest_directory_basic(uuid,text,text,text,integer,integer,date,date,text) from public,anon,authenticated;
revoke all on function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) from public,anon;
grant execute on function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
