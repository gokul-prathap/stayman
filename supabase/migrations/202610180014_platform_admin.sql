begin;
-- Bootstrap administrators through trusted SQL only; clients cannot grant this role.
create table public.stayman_platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.stayman_platform_admins enable row level security;
revoke all on public.stayman_platform_admins from anon,authenticated;
create function public.stayman_is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from public.stayman_platform_admins where user_id=auth.uid());
$$;
revoke all on function public.stayman_is_platform_admin() from public,anon;
grant execute on function public.stayman_is_platform_admin() to authenticated;
alter table public.stayman_properties add column logo_path text;

create function public.stayman_admin_properties() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('team',(
 select coalesce(jsonb_agg(jsonb_build_object('email',u.email,'role',s.role,'user_id',s.user_id)),'[]'::jsonb)
 from public.stayman_staff s join auth.users u on u.id=s.user_id where s.property_id=p.id)) order by p.name)
 from public.stayman_properties p),'[]'::jsonb);
end $$;

create function public.stayman_admin_save_property(p_id uuid,p_details jsonb,p_owner_email text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; is_new boolean;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 if p_id is null or coalesce(length(trim(p_details->>'name')),0) not between 2 and 100
 or coalesce(length(p_details->>'address'),0)>500 or coalesce(length(p_details->>'phone'),0)>25
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_details->>'timezone')
 then raise exception 'Check property name, address, phone and timezone.'; end if;
 is_new:=not exists(select 1 from public.stayman_properties where id=p_id);
 if nullif(trim(p_owner_email),'') is not null then
  select id into owner_id from auth.users where lower(email)=lower(trim(p_owner_email)) and not is_anonymous;
  if owner_id is null then raise exception 'Owner account not found. Create the account in Supabase Authentication first.'; end if;
 elsif is_new then raise exception 'An owner email is required for a new property.';
 end if;
 insert into public.stayman_properties(id,name,address,phone,timezone,instagram_url,whatsapp_number,facebook_url)
 values(p_id,trim(p_details->>'name'),coalesce(trim(p_details->>'address'),''),coalesce(trim(p_details->>'phone'),''),p_details->>'timezone','','','')
 on conflict(id) do update set name=excluded.name,address=excluded.address,phone=excluded.phone,timezone=excluded.timezone;
 if owner_id is not null then
  insert into public.stayman_staff(property_id,user_id,role) values(p_id,owner_id,'OWNER')
  on conflict(property_id,user_id) do update set role='OWNER';
 end if;
 return p_id;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-logos','property-logos',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy platform_admin_logo_insert on storage.objects for insert to authenticated
 with check(bucket_id='property-logos' and public.stayman_is_platform_admin());
create policy platform_admin_logo_delete on storage.objects for delete to authenticated
 using(bucket_id='property-logos' and public.stayman_is_platform_admin());
create policy platform_admin_logo_read on storage.objects for select to authenticated
 using(bucket_id='property-logos' and public.stayman_is_platform_admin());
create function public.stayman_admin_set_logo(p_property uuid,p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 if p_path not like p_property::text||'/%' or not exists(select 1 from storage.objects where bucket_id='property-logos' and name=p_path) then
  raise exception 'Upload a valid property logo first.';
 end if;
 update public.stayman_properties set logo_path=p_path where id=p_property;
 if not found then raise exception 'Property not found.'; end if;
end $$;
create function public.stayman_admin_add_staff(p_property uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare staff_id uuid;
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
 if p_role is null or p_role not in ('OWNER','MANAGER') then raise exception 'Choose Owner or Manager.'; end if;
 select id into staff_id from auth.users where lower(email)=lower(trim(p_email)) and not is_anonymous;
 if staff_id is null then raise exception 'Account not found. Create the account in Supabase Authentication first.'; end if;
 -- Existing owners are never silently demoted by adding staff.
 insert into public.stayman_staff(property_id,user_id,role) values(p_property,staff_id,p_role)
 on conflict(property_id,user_id) do update set role=case when stayman_staff.role='OWNER' then 'OWNER' else excluded.role end;
end $$;
revoke all on function public.stayman_admin_properties(),public.stayman_admin_save_property(uuid,jsonb,text),public.stayman_admin_set_logo(uuid,text),public.stayman_admin_add_staff(uuid,text,text) from public,anon;
grant execute on function public.stayman_admin_properties(),public.stayman_admin_save_property(uuid,jsonb,text),public.stayman_admin_set_logo(uuid,text),public.stayman_admin_add_staff(uuid,text,text) to authenticated;

-- Preserve the existing public profile contract and add only the public logo path.
alter function public.guest_property_profile(uuid,text) rename to guest_property_profile_without_logo;
revoke all on function public.guest_property_profile_without_logo(uuid,text) from public,anon,authenticated;
create function public.guest_property_profile(p_property uuid default null,p_invitation_token text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; selected_property uuid;
begin
 result:=public.guest_property_profile_without_logo(p_property,p_invitation_token);
 if p_invitation_token is not null then
  select coalesce(i.property_id,m.property_id) into selected_property from public.guest_checkin_invitations i
  left join public.stayman_booking_members m on m.invitation_id=i.id
  where i.token_hash=encode(sha256(convert_to(p_invitation_token,'UTF8')),'hex');
 elsif p_property is not null then selected_property:=p_property;
 elsif (select count(*) from public.stayman_properties)=1 then select id into selected_property from public.stayman_properties limit 1;
 end if;
 return result||jsonb_build_object('logo_path',(select logo_path from public.stayman_properties where id=selected_property));
end $$;
revoke all on function public.guest_property_profile(uuid,text) from public;
grant execute on function public.guest_property_profile(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
