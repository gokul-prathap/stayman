-- After 047. Included guests are the base-price allowance, not minimum occupancy.
begin;
create or replace function public.stayman_aiosell_save_validated(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; plan jsonb; plans jsonb; cleaned jsonb:='[]'; seen text[]; prior public.stayman_aiosell_connections;
begin
 if (public.stayman_is_owner(p_property) or public.stayman_is_platform_admin()) is distinct from true then raise exception 'Owner access required.'; end if;
 select * into prior from public.stayman_aiosell_connections where property_id=p_property for update;
 if jsonb_typeof(p_mappings) is distinct from 'array' then raise exception 'Invalid mappings.'; end if;
 -- Do not release/reassign active inventory or remove a published rate plan silently.
 if prior.enabled and exists(select 1 from jsonb_array_elements(prior.mappings) old where not exists(
  select 1 from jsonb_array_elements(p_mappings) fresh where fresh->>'roomCode'=old->>'roomCode'
  and fresh->'unitIds'=old->'unitIds'
  and not exists(select 1 from jsonb_array_elements(coalesce(old->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',old->>'rateplanCode')))) op
   where not exists(select 1 from jsonb_array_elements(coalesce(fresh->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',fresh->>'rateplanCode')))) np where np->>'rateplanCode'=op->>'rateplanCode'))))
 then raise exception 'Use Change mappings to close existing inventory before removing plans or changing assigned units.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  plans:=coalesce(m->'ratePlans',jsonb_build_array(jsonb_build_object('rateplanCode',m->>'rateplanCode','rateSource','pricing')));
  if jsonb_typeof(plans) is distinct from 'array' or jsonb_array_length(plans) not between 1 and 20 then raise exception 'Choose at least one rate plan per category.'; end if;
  seen:='{}';
  for plan in select value from jsonb_array_elements(plans) loop
   if coalesce(length(trim(plan->>'rateplanCode')),0) not between 1 and 120 or plan->>'rateplanCode'=any(seen) then raise exception 'Rate-plan codes must be distinct within a category.'; end if;
   seen:=array_append(seen,plan->>'rateplanCode');
   if plan->>'rateSource'='occupancy' and (coalesce(plan->>'guestCount','') !~ '^[1-9][0-9]?$' or m->'guestPricing' is null or (plan->>'guestCount')::int not between 1 and (m->'guestPricing'->>'maxGuests')::int) then raise exception 'Guest-count price needs valid configured occupancy rules.'; end if;
   if coalesce(plan->>'rateSource','pricing') not in ('pricing','fixed','occupancy') then raise exception 'Invalid rate source.'; end if;
   if plan->>'rateSource'='fixed' and (coalesce(plan->>'ratePaise','') !~ '^[0-9]{1,10}$' or (plan->>'ratePaise')::bigint not between 1 and 100000000) then raise exception 'Set a positive rate-plan price in Pricing.'; end if;
  end loop;
  cleaned:=cleaned||jsonb_build_array((m-'ratePaise')||jsonb_build_object('rateplanCode',plans->0->>'rateplanCode','ratePlans',plans,'ratePaise',0,'rateSource','pricing'));
 end loop;
 perform public.stayman_aiosell_save_config(p_property,p_hotel,p_enabled,cleaned);
end $$;

-- Preserve the private helper boundary; public saves still verify remote plan occupancy.
revoke all on function public.stayman_aiosell_save_validated(uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
