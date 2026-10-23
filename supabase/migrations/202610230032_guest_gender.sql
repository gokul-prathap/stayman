-- Apply after 031. Self-reported gender and compact guest register data.
begin;
alter table public.stayman_guests drop constraint if exists stayman_guests_gender_check;
alter table public.stayman_guests add constraint stayman_guests_gender_check check(gender in ('MALE','FEMALE','NON_BINARY','PREFER_NOT_TO_SAY','NOT_PROVIDED','OTHER'));
alter table public.stayman_guests alter column gender set default 'NOT_PROVIDED';

create or replace function public.stayman_validate_checkin_gender() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' then
  if tg_op='INSERT' or old.status is distinct from 'completed' or new.details->>'gender' is distinct from old.details->>'gender' then
   if coalesce(new.details->>'gender','') not in ('MALE','FEMALE','NON_BINARY','PREFER_NOT_TO_SAY') then raise exception 'Choose your gender, or select Prefer not to say.'; end if;
  end if;
 end if;
 return new;
end $$;
create or replace trigger stayman_checkin_gender before insert or update of status,details on public.guest_checkin_invitations for each row execute function public.stayman_validate_checkin_gender();

-- Only explicitly linked people update a canonical guest; never infer from the
-- booking contact or apply one group member's answer to the rest of the group.
create or replace function public.stayman_sync_guest_gender(p_guest uuid,p_property uuid) returns void
language plpgsql security definer set search_path='' as $$
declare answer text;
begin
 select i.details->>'gender' into answer from public.stayman_booking_members m
 join public.guest_checkin_invitations i on i.id=m.invitation_id and i.property_id=m.property_id
 where m.guest_id=p_guest and m.property_id=p_property and i.status='completed'
 and i.details->>'gender' in ('MALE','FEMALE','NON_BINARY','PREFER_NOT_TO_SAY')
 order by i.completed_at desc nulls last,i.created_at desc,i.id desc limit 1;
 if answer is not null then update public.stayman_guests set gender=answer where id=p_guest and property_id=p_property and gender is distinct from answer; end if;
end $$;
create or replace function public.stayman_checkin_gender_completed() returns trigger
language plpgsql security definer set search_path='' as $$
declare person uuid;
begin
 if new.status='completed' then
  for person in select distinct guest_id from public.stayman_booking_members where invitation_id=new.id and property_id=new.property_id and guest_id is not null loop
   perform public.stayman_sync_guest_gender(person,new.property_id);
  end loop;
 end if;
 return null;
end $$;
create or replace trigger stayman_checkin_gender_completed after insert or update of status,details on public.guest_checkin_invitations for each row execute function public.stayman_checkin_gender_completed();
create or replace function public.stayman_linked_guest_gender() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.guest_id is not null then perform public.stayman_sync_guest_gender(new.guest_id,new.property_id); end if;
 return null;
end $$;
create or replace trigger stayman_linked_guest_gender after insert or update of guest_id,invitation_id on public.stayman_booking_members for each row execute function public.stayman_linked_guest_gender();
revoke all on function public.stayman_validate_checkin_gender(),public.stayman_sync_guest_gender(uuid,uuid),public.stayman_checkin_gender_completed(),public.stayman_linked_guest_gender() from public,anon,authenticated;

create or replace function public.stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival')
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
   'gender',coalesce(nullif(submission->>'gender',''),contact.gender,'NOT_PROVIDED'),
   'nationality',coalesce(contact.nationality,''),'source',booking.source,
   'coming_from',coalesce(submission->>'coming_from',''),'going_to',coalesce(submission->>'going_to',''),
   'document_screening',submission->'document_screening','rooms',rooms,
   'total_amount',booking.total_amount,'paid_amount',booking.paid_amount));
 end loop;
 return jsonb_set(result,'{rows}',rows);
end $$;
revoke all on function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) from public,anon;
grant execute on function public.stayman_guest_directory(uuid,text,text,text,integer,integer,date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
