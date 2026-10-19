begin;
create function public.stayman_block_unit(p_unit uuid,p_from date,p_to date,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_unit public.stayman_units; allocation_id uuid;
begin
 select * into selected_unit from public.stayman_units where id=p_unit for update;
 if not found or not public.stayman_is_staff(selected_unit.property_id) then raise exception 'Staff access required.'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>366
 or p_reason is null or length(trim(p_reason)) not between 1 and 50 then
  raise exception 'Choose valid dates (1–366 nights) and a reason of up to 50 characters.';
 end if;
 -- The existing exclusion constraint rejects overlaps atomically, including
 -- concurrent bookings and blocks. No partial nightly writes are made.
 insert into public.stayman_allocations(property_id,unit_id,check_in_date,check_out_date,status,reason,charge_paise)
 values(selected_unit.property_id,p_unit,p_from,p_to,'MAINTENANCE',trim(p_reason),0) returning id into allocation_id;
 return allocation_id;
end $$;
revoke all on function public.stayman_block_unit(uuid,date,date,text) from public,anon;
grant execute on function public.stayman_block_unit(uuid,date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
