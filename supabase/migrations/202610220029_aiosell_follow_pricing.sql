begin;
-- Resolve channel prices at claim time from the authoritative physical-unit rates.
create or replace function public.stayman_aiosell_resolved_rates(p_property uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((m-'ratePaise') || jsonb_build_object('rateSource','pricing','ratePaise',
   case when n=expected and variants=1 and price>0 then price else null end,'priceError',
   case when n<>expected or n=0 then 'Mapped units are missing or archived.'
        when variants<>1 then 'Mapped units have different prices. Match prices in Pricing or split the room category.'
        when price<=0 then 'Set a positive nightly price in Pricing before publishing rates.' else null end) order by position),'[]'::jsonb)
 from public.stayman_aiosell_connections c cross join lateral jsonb_array_elements(c.mappings) with ordinality entries(m,position)
 cross join lateral (select count(*) n,count(distinct nightly_rate_paise) variants,min(nightly_rate_paise) price
    from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null
    and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))) prices
 cross join lateral (select jsonb_array_length(m->'unitIds') expected) size
 where c.property_id=p_property;
$$;

-- Retain the existing allocation/lease implementation and config validation.
do $$ begin
 if to_regprocedure('public.stayman_aiosell_claim_inventory(uuid)') is null then
  alter function public.stayman_aiosell_claim(uuid) rename to stayman_aiosell_claim_inventory;
 end if;
 if to_regprocedure('public.stayman_aiosell_save_config(uuid,text,boolean,jsonb)') is null then
  alter function public.stayman_aiosell_save(uuid,text,boolean,jsonb) rename to stayman_aiosell_save_config;
 end if;
end $$;
create or replace function public.stayman_aiosell_claim(p_property uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job jsonb;
begin
 job:=public.stayman_aiosell_claim_inventory(p_property);
 if job is null then return null; end if;
 return job || jsonb_build_object('mappings',public.stayman_aiosell_resolved_rates((job->>'property')::uuid));
end $$;
create or replace function public.stayman_aiosell_save(p_property uuid,p_hotel text,p_enabled boolean,p_mappings jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 if jsonb_typeof(p_mappings) is distinct from 'array' then raise exception 'Invalid mappings.'; end if;
 -- A compatibility placeholder satisfies the original validation; never used for publishing.
 perform public.stayman_aiosell_save_config(p_property,p_hotel,p_enabled,
  coalesce((select jsonb_agg((m-'ratePaise')||jsonb_build_object('ratePaise',0,'rateSource','pricing')) from jsonb_array_elements(p_mappings) m),'[]'::jsonb));
end $$;

-- Revision ties each displayed stage result to the exact prices that were sent.
create or replace function public.stayman_aiosell_finish_result(p_property uuid,p_lease uuid,p_revision bigint,p_results jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.stayman_aiosell_connections set last_sync_results=jsonb_build_object('checkedAt',now(),'revision',p_revision,'stages',p_results)
 where property_id=p_property and lease=p_lease;
 if found then perform public.stayman_aiosell_finish(p_property,p_lease,p_revision,p_error); end if;
end $$;

create or replace function public.stayman_aiosell_pricing_status(p_property uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.stayman_aiosell_connections; state text; stage jsonb;
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 select * into c from public.stayman_aiosell_connections where property_id=p_property;
 if not found then return jsonb_build_object('status','not_configured','mappings','[]'::jsonb); end if;
 stage:=c.last_sync_results->'stages'->'rates';
 state:=case when not c.enabled then 'paused'
  when coalesce((c.last_sync_results->>'revision')::bigint,-1)<>c.revision then 'pending'
  when stage->>'status'='sent' then 'sent' when stage->>'status'='failed' then 'failed' else 'pending' end;
 return jsonb_build_object('status',state,'enabled',c.enabled,'checkedAt',c.last_sync_results->'checkedAt',
  'message',case when state='failed' then stage->>'message' else null end,'mappings',public.stayman_aiosell_resolved_rates(p_property));
end $$;

-- Existing mapped units now follow Pricing. Mark enabled properties dirty once.
update public.stayman_aiosell_connections set mappings=coalesce((select jsonb_agg((m-'ratePaise')||jsonb_build_object('ratePaise',0,'rateSource','pricing')) from jsonb_array_elements(mappings) m),'[]'::jsonb),
 revision=revision+1,retry_at=now() where exists(select 1 from jsonb_array_elements(mappings) m where m->>'rateSource' is distinct from 'pricing');
revoke all on function public.stayman_aiosell_resolved_rates(uuid),public.stayman_aiosell_claim_inventory(uuid),public.stayman_aiosell_save_config(uuid,text,boolean,jsonb),public.stayman_aiosell_claim(uuid),public.stayman_aiosell_save(uuid,text,boolean,jsonb),public.stayman_aiosell_pricing_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.stayman_aiosell_claim(uuid) to service_role;
grant execute on function public.stayman_aiosell_save(uuid,text,boolean,jsonb),public.stayman_aiosell_pricing_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
