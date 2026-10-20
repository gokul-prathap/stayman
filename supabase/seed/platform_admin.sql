-- Run through the trusted SQL editor AFTER creating this Authentication account.
-- The email is exactly as supplied. Confirm its spelling before running.
do $$
declare admin_id uuid;
begin
 select id into admin_id from auth.users
 where lower(email)=lower('gokulprathap@rocketmail.com') and not is_anonymous;
 if admin_id is null then
  raise exception 'Create gokulprathap@rocketmail.com in Supabase Authentication first, or correct the email in this script.';
 end if;
 insert into public.stayman_platform_admins(user_id) values(admin_id) on conflict do nothing;
end $$;
