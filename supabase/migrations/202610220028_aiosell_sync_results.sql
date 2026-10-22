begin;
alter table public.stayman_aiosell_connections add column if not exists restriction_channels text[] not null default '{}';
alter table public.stayman_aiosell_connections add column if not exists last_sync_results jsonb;

create or replace function public.stayman_aiosell_channels(p_property uuid,p_channels text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_owner(p_property) then raise exception 'Owner access required.'; end if;
 if p_channels is null or cardinality(p_channels)>50 or exists(select 1 from unnest(p_channels) c where c is null or c !~ '^[A-Za-z0-9._-]{1,120}$') then raise exception 'Invalid restriction channel identifiers.'; end if;
 update public.stayman_aiosell_connections set restriction_channels=array(select distinct c from unnest(p_channels) c order by c),revision=revision+1,retry_at=now(),attempts=0 where property_id=p_property;
 if not found then raise exception 'Save the connection first.'; end if;
end $$;

create or replace function public.stayman_aiosell_finish_result(p_property uuid,p_lease uuid,p_revision bigint,p_results jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Lease guards both the results and queue completion against stale workers.
 update public.stayman_aiosell_connections set last_sync_results=jsonb_build_object('checkedAt',now(),'stages',p_results)
 where property_id=p_property and lease=p_lease;
 if found then perform public.stayman_aiosell_finish(p_property,p_lease,p_revision,p_error); end if;
end $$;
revoke all on function public.stayman_aiosell_channels(uuid,text[]),public.stayman_aiosell_finish_result(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.stayman_aiosell_channels(uuid,text[]) to authenticated;
grant execute on function public.stayman_aiosell_finish_result(uuid,uuid,bigint,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
