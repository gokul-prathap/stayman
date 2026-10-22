begin;
-- After 029: preserve configuration validation but allow safe closure when the
-- restriction stage lacks targets. Acknowledged absolute zero inventory suffices.
create or replace function public.stayman_aiosell_save_config(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare m jsonb; ids uuid[]; used uuid[]:='{}'; code text; codes text[]:='{}'; prior public.stayman_aiosell_connections; inventory_closed boolean;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 select * into prior from public.stayman_aiosell_connections where property_id=p_property for update;
 inventory_closed:=not exists(select 1 from jsonb_array_elements(prior.mappings) x where (x->>'stopSell')::boolean is distinct from true)
   and (coalesce((prior.last_sync_results->>'revision')::bigint,-1)=prior.revision
     and prior.last_sync_results->'stages'->'inventory'->>'status'='sent'
     or prior.synced_revision=prior.revision and prior.last_error is null);
 if prior.enabled and (not p_enabled or prior.hotel_code<>trim(p_hotel)) and not coalesce(inventory_closed,false)
 then raise exception 'Tick Stop sell on every saved mapping, save and sync inventory before pausing. Restrictions may remain pending.'; end if;
 if prior.enabled and exists(select 1 from jsonb_array_elements(prior.mappings) old where not exists(select 1 from jsonb_array_elements(p_mappings) fresh where fresh->>'roomCode'=old->>'roomCode'))
 then raise exception 'Close the existing inventory and pause the connection before removing or renaming a room mapping.'; end if;
 if coalesce(length(trim(p_hotel)),0) not between 1 and 120 or jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings)>100 then raise exception 'Invalid connection settings.'; end if;
 for m in select value from jsonb_array_elements(p_mappings) loop
  code:=m->>'roomCode';
  if coalesce(length(trim(code)),0)=0 then raise exception 'Enter a room code for every mapping or remove unfinished mappings.'; end if;
  if length(code)>120 then raise exception 'Room codes must be 120 characters or fewer.'; end if;
  if code=any(codes) then raise exception 'Room code "%" appears more than once. Each Aiosell room code must be unique.',code; end if;
  codes:=array_append(codes,code);
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(m->'unitIds');
  if coalesce(cardinality(ids),0)=0 or ids && used or cardinality(ids)<>(select count(distinct v) from unnest(ids) v)
    or exists(select 1 from unnest(ids) v where not exists(select 1 from public.stayman_units u where u.id=v and u.property_id=p_property and u.archived_at is null)) then raise exception 'Choose distinct active units from this property.'; end if;
  if (select count(distinct (u.unit_type,u.gender_policy)) from public.stayman_units u where u.id=any(ids))<>1 then raise exception 'A room mapping cannot mix beds, rooms or gender policies.'; end if;
  used:=used||ids;
  if coalesce(length(m->>'rateplanCode'),0) not between 1 and 120 or coalesce(m->>'ratePaise','') !~ '^[0-9]{1,10}$'
    or coalesce(m->>'minimumStay','') !~ '^[1-9][0-9]{0,2}$' or jsonb_typeof(m->'stopSell') is distinct from 'boolean' then raise exception 'Set a valid rate plan and restrictions.'; end if;
 end loop;
 if p_enabled and jsonb_array_length(p_mappings)=0 then raise exception 'Map inventory before enabling sync.'; end if;
 if exists(select 1 from public.stayman_aiosell_connections where property_id=p_property and hotel_code<>trim(p_hotel))
 and exists(select 1 from public.stayman_aiosell_bookings where property_id=p_property) then raise exception 'Hotel code cannot change after receiving bookings.'; end if;
 insert into public.stayman_aiosell_connections(property_id,hotel_code,enabled,mappings) values(p_property,trim(p_hotel),p_enabled,p_mappings)
 on conflict(property_id) do update set hotel_code=excluded.hotel_code,enabled=excluded.enabled,mappings=excluded.mappings,
 revision=stayman_aiosell_connections.revision+1,retry_at=now(),attempts=0,updated_at=now();
end $$;
revoke all on function public.stayman_aiosell_save_config(uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
