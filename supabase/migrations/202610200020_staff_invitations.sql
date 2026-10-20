begin;
create table if not exists public.stayman_staff_invitations(
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.stayman_properties(id),
 email text not null,
 role text not null check(role in ('OWNER','MANAGER')),
 status text not null default 'SENDING' check(status in ('SENDING','SENT','FAILED','ACCEPTED')),
 invited_by uuid not null references auth.users(id),
 user_id uuid references auth.users(id),
 sent_at timestamptz not null default now(),
 accepted_at timestamptz,
 unique(property_id,email)
);
alter table public.stayman_staff_invitations enable row level security;
revoke all on public.stayman_staff_invitations from public,anon,authenticated;
grant select on public.stayman_staff_invitations to authenticated;
grant all on public.stayman_staff_invitations to service_role;
drop policy if exists admin_read_invitations on public.stayman_staff_invitations;
create policy admin_read_invitations on public.stayman_staff_invitations for select to authenticated using(public.stayman_is_platform_admin());

-- The reservation is committed before email is sent; repeated clicks are throttled server-side.
create or replace function public.stayman_prepare_staff_invitation(p_property uuid,p_email text,p_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); invitation public.stayman_staff_invitations; account_id uuid;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 if p_role is null or p_role not in ('OWNER','MANAGER') then raise exception 'Choose Owner or Manager.';end if;
 if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.';end if;
 if not exists(select 1 from public.stayman_properties where id=p_property) then raise exception 'Property not found.';end if;
 -- Serialize concurrent requests for this property/email, including the first insert.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text||':'||address,0));
 select * into invitation from public.stayman_staff_invitations where property_id=p_property and email=address;
 if found and invitation.sent_at>now()-interval '60 seconds' then raise exception 'Wait one minute before sending another invitation.';end if;
 select id into account_id from auth.users where lower(email)=address and not is_anonymous;
 insert into public.stayman_staff_invitations(property_id,email,role,invited_by,user_id)
 values(p_property,address,p_role,auth.uid(),account_id)
 on conflict(property_id,email) do update set role=excluded.role,status='SENDING',invited_by=excluded.invited_by,user_id=excluded.user_id,sent_at=now(),accepted_at=null
 returning * into invitation;
 return jsonb_build_object('id',invitation.id,'user_id',account_id,'email',address);
end $$;

create or replace function public.stayman_accept_staff_invitations() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in using your invitation first.';end if;
 update public.stayman_staff_invitations i set status='ACCEPTED',accepted_at=now()
 where i.user_id=auth.uid() and i.status in ('SENDING','SENT')
 and exists(select 1 from public.stayman_staff s where s.user_id=auth.uid() and s.property_id=i.property_id);
end $$;
revoke all on function public.stayman_prepare_staff_invitation(uuid,text,text),public.stayman_accept_staff_invitations() from public,anon;
grant execute on function public.stayman_prepare_staff_invitation(uuid,text,text),public.stayman_accept_staff_invitations() to authenticated;
notify pgrst,'reload schema';
commit;
