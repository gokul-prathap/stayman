begin;
create function public.stayman_extend_maintenance(p_allocation uuid,p_expected_to date,p_to date)
returns void language plpgsql security definer set search_path='' as $$
declare a public.stayman_allocations;
begin
 select * into a from public.stayman_allocations where id=p_allocation for update;
 if not found or not public.stayman_is_staff(a.property_id) then raise exception 'Maintenance not found or staff access required.'; end if;
 if a.status<>'MAINTENANCE' then raise exception 'Only maintenance blocks can be extended.'; end if;
 if p_expected_to is null or a.check_out_date<>p_expected_to then raise exception 'Maintenance changed. Refresh and try again.'; end if;
 if p_to is null or p_to<=a.check_out_date or p_to-a.check_in_date>366 then raise exception 'Choose a later end date within 366 nights of the start.'; end if;
 -- The allocation exclusion constraint rejects conflicting nights atomically.
 update public.stayman_allocations set check_out_date=p_to where id=a.id;
 insert into public.stayman_staff_actions(property_id,entity_id,action,before_details,after_details,actor)
 values(a.property_id,a.id,'EXTEND_MAINTENANCE',to_jsonb(a),jsonb_set(to_jsonb(a),'{check_out_date}',to_jsonb(p_to)),auth.uid());
end $$;
revoke all on function public.stayman_extend_maintenance(uuid,date,date) from public,anon;
grant execute on function public.stayman_extend_maintenance(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
