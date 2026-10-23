-- Return the resolved property ID so staff membership can be checked for private links.
begin;
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
 select jsonb_build_object('id',id,'name',name,'tagline',tagline,'logo_path',logo_path,'instagram_url',instagram_url,'whatsapp_number',whatsapp_number,'facebook_url',facebook_url)
 into result from public.stayman_properties where id=selected_property;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
