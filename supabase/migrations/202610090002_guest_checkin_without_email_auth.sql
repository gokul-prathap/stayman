-- Apply AFTER 202610090001_guest_checkin.sql, including on existing installations.
-- Access is granted by possession of the private invitation, not verified email.
create or replace function public.claim_guest_checkin(invitation_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_checkin_invitations;
begin
  if auth.uid() is null or invitation_token is null
    or invitation_token !~ '^[a-fA-F0-9]{64}$' then
    raise exception 'Invalid invitation or guest session required.';
  end if;
  select * into invitation from public.guest_checkin_invitations
    where token_hash = encode(sha256(convert_to(invitation_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'Invalid invitation. Contact reception.'; end if;
  -- Completed links expose only a receipt, never contact details or document access
  -- to a newly signed-in browser. Do not transfer their owner.
  if invitation.status = 'completed' then
    return jsonb_build_object('id', invitation.id, 'status', 'completed');
  end if;
  if invitation.expires_at <= now() then
    raise exception 'Invitation expired. Contact reception.';
  end if;
  -- A valid bearer link may resume a draft on another device.
  -- Only the latest session can upload/complete that draft.
  update public.guest_checkin_invitations set user_id = auth.uid() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', invitation.status);
end;
$$;
revoke all on function public.claim_guest_checkin(text) from public, anon;
grant execute on function public.claim_guest_checkin(text) to authenticated;

create or replace function public.complete_guest_checkin(invitation_id uuid, guest_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_checkin_invitations;
begin
  select * into invitation from public.guest_checkin_invitations
    where id = invitation_id and user_id = auth.uid() for update;
  if not found then raise exception 'Invitation not found.'; end if;
  if invitation.status = 'completed' then
    return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation expired. Contact reception.'; end if;
  if guest_details is null or jsonb_typeof(guest_details) <> 'object'
    or coalesce(length(trim(guest_details->>'full_name')), 0) not between 1 and 120
    or coalesce(length(guest_details->>'email'), 0) not between 3 and 254
    or coalesce(guest_details->>'email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or coalesce(guest_details->>'phone', '') !~ '^[+0-9() .-]{7,25}$'
    or coalesce(length(trim(guest_details->>'coming_from')), 0) not between 1 and 160
    or coalesce(length(trim(guest_details->>'going_to')), 0) not between 1 and 160
    or coalesce(guest_details->>'arrival_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(guest_details->>'departure_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(jsonb_typeof(guest_details->'foreign_guest'), '') <> 'boolean'
    or octet_length(guest_details::text) > 4096 then
    raise exception 'Please provide valid guest details.';
  end if;
  if (guest_details->>'departure_date')::date < (guest_details->>'arrival_date')::date then
    raise exception 'Departure must be on or after arrival.';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'guest-identities'
      and name in (invitation.id::text || '/front.jpg', invitation.id::text || '/back.jpg')) <> 2 then
    raise exception 'Both identity photos must be uploaded.';
  end if;
  update public.guest_checkin_invitations set details = guest_details, email = lower(trim(guest_details->>'email')),
    status = 'completed', completed_at = now() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
end;
$$;
revoke all on function public.complete_guest_checkin(uuid, jsonb) from public, anon;
grant execute on function public.complete_guest_checkin(uuid, jsonb) to authenticated;
