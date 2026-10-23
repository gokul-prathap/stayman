-- Keep failed/manual no-show updates visible without another dashboard request.
begin;
create index if not exists stayman_no_show_pending on public.stayman_no_show_outbox(property_id,status,updated_at);
create index if not exists stayman_staff_actions_recent on public.stayman_staff_actions(property_id,created_at desc);
create index if not exists stayman_staff_actions_entity on public.stayman_staff_actions(property_id,entity_id,created_at desc);
create index if not exists stayman_guest_corrections_recent on public.stayman_guest_corrections(property_id,updated_at desc);
create index if not exists stayman_closure_dates on public.stayman_reservations(property_id,closure_at) where closure_kind is not null;
do $$ begin
 if to_regprocedure('public.stayman_checkin_notifications_pre_review(uuid)') is null then
  alter function public.stayman_checkin_notifications(uuid) rename to stayman_checkin_notifications_pre_review;
 end if;
end $$;
create or replace function public.stayman_checkin_notifications(p_property uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.stayman_checkin_notifications_pre_review(p_property);
 return result||jsonb_build_object(
  'revision',md5(coalesce(result->>'revision','')||coalesce((select created_at::text from public.stayman_staff_actions where property_id=p_property order by created_at desc limit 1),'')||coalesce((select updated_at::text from public.stayman_guest_corrections where property_id=p_property order by updated_at desc limit 1),'')),
  'no_show_sync_count',(select count(*) from public.stayman_no_show_outbox where property_id=p_property and status<>'SENT'),
  'no_show_sync',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select o.reservation_id as id,g.full_name as guest_name,o.status,o.message from public.stayman_no_show_outbox o
   join public.stayman_reservations r on r.id=o.reservation_id join public.stayman_guests g on g.id=r.guest_id
   where o.property_id=p_property and o.status<>'SENT' order by o.updated_at,o.reservation_id limit 30
  ) x),'[]'));
end $$;
revoke all on function public.stayman_checkin_notifications_pre_review(uuid) from public,anon,authenticated;
revoke all on function public.stayman_checkin_notifications(uuid) from public,anon;
grant execute on function public.stayman_checkin_notifications(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
