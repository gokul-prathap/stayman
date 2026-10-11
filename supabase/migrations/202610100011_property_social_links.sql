-- Apply after migration 010. Public profile exposes only branding and contact links.
begin;
alter table public.stayman_properties
  add column instagram_url text not null default 'https://www.instagram.com/hostarica_/',
  add column whatsapp_number text not null default '+918593988018',
  add column facebook_url text not null default '';
create or replace function public.stayman_save_settings(p_property uuid,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.stayman_is_owner(p_property) then raise exception 'Owner access required to change settings.'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object'
    or coalesce(length(trim(p_details->>'name')),0) not between 2 and 100
    or coalesce(length(p_details->>'address'),0)>500
    or coalesce(length(p_details->>'phone'),0)>25
    or coalesce(p_details->>'currency','')<>'INR'
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_details->>'timezone')
    or coalesce(p_details->>'check_in_time','') !~ '^[0-9]{2}:[0-9]{2}$'
    or coalesce(p_details->>'check_out_time','') !~ '^[0-9]{2}:[0-9]{2}$' then
    raise exception 'Please provide valid property settings.';
  end if;
  if length(coalesce(p_details->>'instagram_url',''))>2048
    or (coalesce(p_details->>'instagram_url','')<>'' and p_details->>'instagram_url' !~ '^https://(www[.])?instagram[.]com/[^[:space:]]*$')
    or length(coalesce(p_details->>'facebook_url',''))>2048
    or (coalesce(p_details->>'facebook_url','')<>'' and p_details->>'facebook_url' !~ '^https://(www[.])?(facebook[.]com|fb[.]com)/[^[:space:]]*$')
    or (coalesce(p_details->>'whatsapp_number','')<>'' and p_details->>'whatsapp_number' !~ '^[+][1-9][0-9]{6,14}$') then
    raise exception 'Please provide valid social page URLs and a WhatsApp number with country code.';
  end if;
  update public.stayman_properties set instagram_url=coalesce(p_details->>'instagram_url',''), facebook_url=coalesce(p_details->>'facebook_url',''), whatsapp_number=coalesce(p_details->>'whatsapp_number',''), name=trim(p_details->>'name'),address=coalesce(trim(p_details->>'address'),''),
    phone=coalesce(trim(p_details->>'phone'),''),currency='INR',timezone=p_details->>'timezone',
    check_in_time=(p_details->>'check_in_time')::time,check_out_time=(p_details->>'check_out_time')::time
    where id=p_property;
end $$;


create function public.guest_property_profile(p_property uuid default null, p_invitation_token text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected_property uuid; result jsonb;
begin
  if p_invitation_token is not null then
    select coalesce(i.property_id,m.property_id) into selected_property
    from public.guest_checkin_invitations i
    left join public.stayman_booking_members m on m.invitation_id=i.id
    where i.token_hash=encode(sha256(convert_to(p_invitation_token,'UTF8')),'hex');
  elsif p_property is not null then selected_property:=p_property;
  elsif (select count(*) from public.stayman_properties)=1 then
    select id into selected_property from public.stayman_properties limit 1;
  end if;
  select jsonb_build_object('name',name,'instagram_url',instagram_url,
    'facebook_url',facebook_url,'whatsapp_number',whatsapp_number)
    into result from public.stayman_properties where id=selected_property;
  return result;
end $$;
revoke all on function public.guest_property_profile(uuid,text) from public;
grant execute on function public.guest_property_profile(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
