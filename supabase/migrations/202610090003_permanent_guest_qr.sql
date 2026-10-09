-- Apply after migrations 001 and 002. No per-guest invitation SQL is needed.
alter table public.guest_checkin_invitations add column source text not null default 'invitation'
  check (source in ('invitation', 'public_qr'));
create unique index one_public_checkin_per_session on public.guest_checkin_invitations(user_id)
  where source = 'public_qr';

create table public.guest_checkin_daily_usage (
  day date primary key,
  submissions integer not null default 0 check (submissions between 0 and 100)
);
alter table public.guest_checkin_daily_usage enable row level security;
revoke all on public.guest_checkin_daily_usage from public, anon, authenticated;

create function public.start_public_guest_checkin()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  guest public.guest_checkin_invitations;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  reserved integer;
begin
  if auth.uid() is null then raise exception 'A guest session is required.'; end if;
  -- Serializes same-session calls (including StrictMode and simultaneous tabs).
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 73481));
  select * into guest from public.guest_checkin_invitations
    where user_id = auth.uid() and source = 'public_qr' for update;
  if found then
    if guest.status = 'completed' then
      return jsonb_build_object('id', guest.id, 'status', 'completed');
    end if;
    if guest.expires_at > now() then
      return jsonb_build_object('id', guest.id, 'status', 'draft', 'email', '');
    end if;
  end if;
  insert into public.guest_checkin_daily_usage(day) values (today) on conflict do nothing;
  update public.guest_checkin_daily_usage set submissions = submissions + 1
    where day = today and submissions < 100 returning submissions into reserved;
  if not found then
    raise exception 'Daily check-in limit reached. Please contact the manager.';
  end if;
  if guest.id is not null then
    -- Renew an expired empty/partial draft without accumulating extra file paths.
    update public.guest_checkin_invitations
      set expires_at = ((today + 1)::timestamp at time zone 'Asia/Kolkata')
      where id = guest.id;
  else
    insert into public.guest_checkin_invitations(token_hash, email, expires_at, user_id, source)
      values (encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
        'pending@hostarica.invalid',
        ((today + 1)::timestamp at time zone 'Asia/Kolkata'), auth.uid(), 'public_qr')
      returning * into guest;
  end if;
  return jsonb_build_object('id', guest.id, 'status', 'draft', 'email', '');
end;
$$;
revoke all on function public.start_public_guest_checkin() from public, anon;
grant execute on function public.start_public_guest_checkin() to authenticated;
