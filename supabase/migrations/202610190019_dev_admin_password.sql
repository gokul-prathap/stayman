begin;
-- Server-managed, expiring development exception. No client can grant itself access.
create table if not exists public.stayman_dev_admin_password_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
alter table public.stayman_dev_admin_password_access enable row level security;
revoke all on public.stayman_dev_admin_password_access from public, anon, authenticated;

-- Enable only the requested existing platform administrator, temporarily.
do $$
begin
 if not exists(select 1 from auth.users where lower(email)='gokulprathap@rocketmail.com') then
  raise exception 'Administrator email gokulprathap@rocketmail.com was not found in Supabase Authentication. Create the account first.';
 end if;
 -- Explicit bootstrap requested by the platform owner; only trusted SQL can run this.
 insert into public.stayman_platform_admins(user_id)
 select id from auth.users where lower(email)='gokulprathap@rocketmail.com'
 on conflict(user_id) do nothing;
end $$;
insert into public.stayman_dev_admin_password_access(user_id,expires_at)
select u.id,now()+interval '7 days' from auth.users u
join public.stayman_platform_admins a on a.user_id=u.id
where lower(u.email)='gokulprathap@rocketmail.com'
on conflict(user_id) do update set expires_at=excluded.expires_at;

create or replace function public.stayman_is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from public.stayman_platform_admins where user_id=auth.uid())
 and exists(select 1 from jsonb_array_elements(
  case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
 ) method where method->>'method'='otp' or (
  method->>'method'='password' and exists(
   select 1 from public.stayman_dev_admin_password_access
   where user_id=auth.uid() and expires_at>now()
  )
 ));
$$;
revoke all on function public.stayman_is_platform_admin() from public,anon;
grant execute on function public.stayman_is_platform_admin() to authenticated;
notify pgrst,'reload schema';
commit;
