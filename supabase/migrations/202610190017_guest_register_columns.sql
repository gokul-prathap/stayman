begin;
-- Preserve server-side filtering/pagination and enrich only the selected page.
alter function public.stayman_guest_directory(uuid,text,text,text,integer,integer) rename to stayman_guest_directory_basic;
revoke all on function public.stayman_guest_directory_basic(uuid,text,text,text,integer,integer) from public,anon,authenticated;
create function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; entry jsonb; rows jsonb:='[]'::jsonb; submission jsonb; contact public.stayman_guests; booking public.stayman_reservations; rooms jsonb;
begin
 if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.'; end if;
 result:=public.stayman_guest_directory_basic(p_property,p_search,p_filter,p_checkin,p_page,p_size);
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
revoke all on function public.stayman_guest_directory(uuid,text,text,text,integer,integer) from public,anon;
grant execute on function public.stayman_guest_directory(uuid,text,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
