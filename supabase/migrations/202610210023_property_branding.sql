begin;
alter table public.stayman_properties add column if not exists tagline text not null default '';
alter table public.stayman_properties alter column instagram_url set default '';
alter table public.stayman_properties alter column whatsapp_number set default '';

do $$begin
 if to_regprocedure('public.stayman_admin_save_property_core(uuid,jsonb,text)') is null then
  alter function public.stayman_admin_save_property(uuid,jsonb,text) rename to stayman_admin_save_property_core;
 end if;
end $$;
revoke all on function public.stayman_admin_save_property_core(uuid,jsonb,text) from public,anon,authenticated;

create or replace function public.stayman_admin_save_property(p_id uuid,p_details jsonb,p_owner_email text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; instagram text:=trim(coalesce(p_details->>'instagram_url','')); whatsapp text:=regexp_replace(coalesce(p_details->>'whatsapp_number',''),'[[:space:]().-]','','g'); facebook text:=trim(coalesce(p_details->>'facebook_url',''));
begin
 if not public.stayman_is_platform_admin() then raise exception 'Platform administrator access required.';end if;
 if length(coalesce(p_details->>'tagline',''))>120 then raise exception 'Property tagline must be at most 120 characters.';end if;
 if length(instagram)>2048 or (instagram<>'' and instagram !~ '^https://(www[.])?instagram[.]com/[A-Za-z0-9_.]+/?$') then raise exception 'Enter a valid HTTPS Instagram profile URL.';end if;
 if length(facebook)>2048 or (facebook<>'' and facebook !~ '^https://(www[.])?(facebook[.]com|fb[.]com)/[^[:space:]]+$') then raise exception 'Enter a valid HTTPS Facebook page URL.';end if;
 if whatsapp<>'' and whatsapp !~ '^[+][1-9][0-9]{6,14}$' then raise exception 'Enter WhatsApp with country code, for example +919876543210.';end if;
 if (p_details?'check_in_time' and coalesce(p_details->>'check_in_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or (p_details?'check_out_time' and coalesce(p_details->>'check_out_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Enter valid check-in and check-out times.';end if;
 result:=public.stayman_admin_save_property_core(p_id,p_details,p_owner_email);
 update public.stayman_properties set
  tagline=case when p_details?'tagline' then trim(coalesce(p_details->>'tagline','')) else tagline end,
  instagram_url=case when p_details?'instagram_url' then instagram else instagram_url end,
  whatsapp_number=case when p_details?'whatsapp_number' then whatsapp else whatsapp_number end,
  facebook_url=case when p_details?'facebook_url' then facebook else facebook_url end,
  check_in_time=case when p_details?'check_in_time' then (p_details->>'check_in_time')::time else check_in_time end,
  check_out_time=case when p_details?'check_out_time' then (p_details->>'check_out_time')::time else check_out_time end
 where id=result;
 return result;
end $$;
revoke all on function public.stayman_admin_save_property(uuid,jsonb,text) from public,anon;
grant execute on function public.stayman_admin_save_property(uuid,jsonb,text) to authenticated;

create or replace function public.guest_property_profile(p_property uuid default null,p_invitation_token text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected_property uuid; result jsonb;
begin
 if p_invitation_token is not null then
  select coalesce(i.property_id,m.property_id) into selected_property from public.guest_checkin_invitations i
  left join public.stayman_booking_members m on m.invitation_id=i.id
  where i.token_hash=encode(sha256(convert_to(p_invitation_token,'UTF8')),'hex');
 elsif p_property is not null then selected_property:=p_property;
 elsif (select count(*) from public.stayman_properties)=1 then select id into selected_property from public.stayman_properties limit 1;
 end if;
 select jsonb_build_object('name',name,'tagline',tagline,'logo_path',logo_path,'instagram_url',instagram_url,'whatsapp_number',whatsapp_number,'facebook_url',facebook_url)
 into result from public.stayman_properties where id=selected_property;
 return result;
end $$;
revoke all on function public.guest_property_profile(uuid,text) from public;
grant execute on function public.guest_property_profile(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
