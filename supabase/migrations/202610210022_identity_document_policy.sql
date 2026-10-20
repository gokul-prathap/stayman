-- Keep all existing invitation, booking, guest-details and private-upload checks.
begin;
create or replace function public.complete_guest_checkin_validated(invitation_id uuid, guest_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_checkin_invitations; document_kind text; back_required boolean; back_supplied boolean;
begin
  select * into invitation from public.guest_checkin_invitations
    where id = invitation_id and user_id = auth.uid() for update;
  if not found then raise exception 'Invitation not found.'; end if;
  if invitation.status = 'completed' then
    return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation expired. Contact reception.'; end if;
  if guest_details is null or jsonb_typeof(guest_details) <> 'object'
    or coalesce(length(trim(guest_details->>'full_name')), 0) not between 1 and 100
    or coalesce(length(guest_details->>'email'), 0) not between 3 and 254
    or coalesce(guest_details->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or coalesce(guest_details->>'phone', '') !~ '^[+0-9() .-]{7,25}$'
    or coalesce(length(trim(guest_details->>'coming_from')), 0) not between 1 and 150
    or coalesce(length(trim(guest_details->>'going_to')), 0) not between 1 and 150
    or coalesce(guest_details->>'arrival_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(guest_details->>'departure_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(jsonb_typeof(guest_details->'foreign_guest'), '') <> 'boolean'
    or octet_length(guest_details::text) > 4096 then
    raise exception 'Please provide valid guest details.';
  end if;
  document_kind:=upper(regexp_replace(trim(coalesce(guest_details->>'document_type',case when (guest_details->>'foreign_guest')::boolean then 'PASSPORT' else 'AADHAAR' end)),'[[:space:]-]+','_','g'));
  if document_kind in ('DL','LICENCE','LICENSE','DRIVING_LICENCE') then document_kind:='DRIVING_LICENSE';end if;
  if document_kind in ('PAN','PAN_CARD','PANCARD') then raise exception 'PAN cards are not accepted. Choose another identity document.';end if;
  if document_kind not in ('AADHAAR','DRIVING_LICENSE','VOTER_ID','PASSPORT') then raise exception 'Choose an accepted identity document.';end if;
  if (guest_details->>'foreign_guest')::boolean and document_kind<>'PASSPORT' then raise exception 'Foreign guests must upload a passport and visa.';end if;
  back_required:=(guest_details->>'foreign_guest')::boolean or document_kind<>'DRIVING_LICENSE';
  back_supplied:=back_required or coalesce(guest_details->'document_sides' @> '["back"]'::jsonb,false);
  if (guest_details->>'arrival_date')::date < (now() at time zone 'Asia/Kolkata')::date
    and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=invitation.id) then
    raise exception 'Arrival cannot be before today.';
  end if;
  if regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') !~ '^([6-9][0-9]{9}|[+][1-9][0-9]{6,14})$'
    or (regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') like '+91%'
      and regexp_replace(guest_details->>'phone', '[() .-]', '', 'g') !~ '^[+]91[6-9][0-9]{9}$') then
    raise exception 'Please enter a valid Indian or international phone number.';
  end if;
  if length(trim(guest_details->>'full_name')) < 2
    or length(trim(guest_details->>'coming_from')) < 2
    or length(trim(guest_details->>'going_to')) < 2 then
    raise exception 'Name and travel locations must contain at least 2 characters.';
  end if;
  if (guest_details->>'departure_date')::date <= (guest_details->>'arrival_date')::date then
    raise exception 'Departure must be later than arrival.';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='guest-identities' and name=invitation.id::text||'/front.jpg') then
    raise exception 'Upload the identity document front photo.';
  end if;
  if back_supplied and not exists(select 1 from storage.objects where bucket_id='guest-identities' and name=invitation.id::text||'/back.jpg') then
    raise exception 'Upload the required identity back photo or visa.';
  end if;
  guest_details:=guest_details||jsonb_build_object('document_type',document_kind,'document_sides',case when back_supplied then '["front","back"]'::jsonb else '["front"]'::jsonb end);
  update public.guest_checkin_invitations set details = guest_details, email = lower(trim(guest_details->>'email')),
    status = 'completed', completed_at = now() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
end;
$$;

revoke all on function public.complete_guest_checkin_validated(uuid,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
