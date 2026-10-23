-- Optional home address stays in each guest's own check-in submission.
begin;
create or replace function public.stayman_invoice_context(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; r public.stayman_reservations;
begin
 result:=public.stayman_folio_preview(p_reservation);
 select * into r from public.stayman_reservations where id=p_reservation;
 return result||jsonb_build_object('guest_address',case when result->>'status'='ISSUED' then null else
 (select nullif(trim(i.details->>'address'),'') from public.stayman_booking_members m
 join public.guest_checkin_invitations i on i.id=m.invitation_id and i.property_id=m.property_id
 where m.reservation_id=r.id and m.property_id=r.property_id and m.guest_id=r.guest_id and i.status='completed'
 and nullif(trim(i.details->>'address'),'') is not null
 order by i.completed_at desc nulls last,m.created_at desc,m.id limit 1) end,'checkout_status',r.status,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'checked_out_at',checked_out_at) order by created_at,id),'[]') from public.stayman_booking_members where reservation_id=r.id),'rooms',case when r.checked_out_at is not null then r.checkout_rooms else result->'rooms' end);
end $$;
notify pgrst,'reload schema';
commit;
