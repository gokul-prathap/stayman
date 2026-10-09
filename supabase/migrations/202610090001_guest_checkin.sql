-- Run through Supabase migrations or the SQL editor as an administrator.
create table public.guest_checkin_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  email text not null check (length(email) between 3 and 254),
  expires_at timestamptz not null,
  user_id uuid references auth.users(id),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  details jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.guest_checkin_invitations enable row level security;
revoke all on public.guest_checkin_invitations from anon, authenticated;
grant select on public.guest_checkin_invitations to authenticated;
create policy guest_read_own_invitation on public.guest_checkin_invitations
  for select to authenticated using (user_id = (select auth.uid()));

create function public.claim_guest_checkin(invitation_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_checkin_invitations;
begin
  if auth.uid() is null or length(invitation_token) <> 64 then
    raise exception 'Invalid invitation or authentication required.';
  end if;
  select * into invitation from public.guest_checkin_invitations
    where token_hash = encode(sha256(convert_to(invitation_token, 'UTF8')), 'hex') for update;
  if not found or lower(invitation.email) is distinct from lower(auth.jwt()->>'email')
    or (invitation.user_id is not null and invitation.user_id <> auth.uid())
    or (invitation.status <> 'completed' and invitation.expires_at <= now()) then
    raise exception 'Invitation is invalid, expired, or belongs to another email.';
  end if;
  update public.guest_checkin_invitations set user_id = auth.uid() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', invitation.status);
end;
$$;
revoke all on function public.claim_guest_checkin(text) from public, anon;
grant execute on function public.claim_guest_checkin(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('guest-identities', 'guest-identities', false, 1048576, array['image/jpeg']);

-- Only two exact object names per invitation; no arbitrary paths or file accumulation.
create function public.can_write_guest_identity(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guest_checkin_invitations i
    where i.user_id = auth.uid() and i.status = 'draft' and i.expires_at > now()
      and object_name in (i.id::text || '/front.jpg', i.id::text || '/back.jpg')
  );
$$;
revoke all on function public.can_write_guest_identity(text) from public, anon;
grant execute on function public.can_write_guest_identity(text) to authenticated;
create policy guest_identity_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'guest-identities' and public.can_write_guest_identity(name));
create policy guest_identity_update on storage.objects for update to authenticated
  using (bucket_id = 'guest-identities' and public.can_write_guest_identity(name))
  with check (bucket_id = 'guest-identities' and public.can_write_guest_identity(name));
create policy guest_identity_read on storage.objects for select to authenticated
  using (bucket_id = 'guest-identities' and exists (
    select 1 from public.guest_checkin_invitations i
    where i.user_id = auth.uid() and name in (i.id::text || '/front.jpg', i.id::text || '/back.jpg')
  ));
-- No guest deletion policy; completed documents are locked.

create function public.complete_guest_checkin(invitation_id uuid, guest_details jsonb)
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
  update public.guest_checkin_invitations set details = guest_details,
    status = 'completed', completed_at = now() where id = invitation.id;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'status', 'completed');
end;
$$;
revoke all on function public.complete_guest_checkin(uuid, jsonb) from public, anon;
grant execute on function public.complete_guest_checkin(uuid, jsonb) to authenticated;
