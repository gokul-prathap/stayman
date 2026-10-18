begin;
-- All admin RPCs and logo-write policies already use this shared authorization gate.
-- Password-only, recovery and invitation sessions cannot administer the platform.
create or replace function public.stayman_is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from public.stayman_platform_admins where user_id=auth.uid())
 and exists(select 1 from jsonb_array_elements(
  case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end
 ) method where method->>'method'='otp');
$$;
revoke all on function public.stayman_is_platform_admin() from public,anon;
grant execute on function public.stayman_is_platform_admin() to authenticated;
notify pgrst,'reload schema';
commit;
