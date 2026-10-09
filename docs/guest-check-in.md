# Guest QR check-in

The standalone route is /guest-check-in. It uses the existing Supabase client and shared Input/Button styling. Identity files use private Storage; guest details live in guest_checkin_invitations. This does not create a reservation or mark a room occupied.

## Setup

1. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Never place a service-role key in Vite.
2. Apply supabase/migrations/202610090001_guest_checkin.sql to the existing Supabase project.
3. Configure Supabase Auth email OTP templates to include {{ .Token }} (both signup confirmation and magic link), SMTP, and production Auth rate limits/CAPTCHA appropriate to your traffic. The form accepts an email code, not a magic-link callback.
4. Host with SPA fallback to index.html and HTTPS.
5. Create an invitation from a trusted backend or the Supabase SQL editor. Never expose invitation creation to public clients. The QR is per guest/stay, rather than a shared QR that grants unlimited uploads.

Example for the SQL editor (replace email and your application's origin):

```sql
with token as (select encode(gen_random_bytes(32), 'hex') as value),
invitation as (
  insert into public.guest_checkin_invitations (token_hash, email, expires_at)
  select encode(sha256(convert_to(value, 'UTF8')), 'hex'),
    'guest@example.com', now() + interval '2 days'
  from token returning id
)
select 'https://YOUR-APP/guest-check-in#invite=' || value as qr_target
from token, invitation;
```

Encode qr_target using your reception QR generator. The fragment avoids sending the invitation token in HTTP requests/referrers. Query parameter invite is also supported for existing QR tooling. Keep tokens confidential. No third-party QR service is called by the app.

## Limits and behavior

Email OTP proves account ownership; the hashed, expiring invitation must match the verified email. Only its owner can claim it. RLS and RPC permissions block anonymous uploads and direct changes to invitation status/details. Private bucket policies allow exactly front.jpg and back.jpg per invitation (1 MB JPEG each). Resubmitting after a partial failure overwrites those slots without accumulating files. Repeated scans restore an existing authenticated session and show Already uploaded after completion; on another browser the guest verifies the same email again.

Original photos are capped at 10 MB in the UI, resized to 1600 pixels on the longest edge, re-encoded as JPEG (removing original metadata), and compressed below 1 MB. The UI supports JPEG/PNG/WebP only. Confirm the compressed identity details are readable before submission.

Completed submissions are locked against subsequent guest writes. Reception corrections require a new invitation or an administrator-managed reset. Expired draft cleanup, retention rules, staff review, malware/content inspection, strict request-rate limits, and invitation provisioning integration are operational follow-ups. Storage MIME limits alone do not prove uploaded bytes are a legitimate identity image; do not serve these files as public or active content. Audit existing storage policies: permissive policies for authenticated users can widen access to this bucket.

The commented future IP/network hook is in guestCheckinService.js. Implement it in trusted server code only. Shared Wi-Fi/IP cannot identify a person and should remain a supplementary abuse signal, not the mechanism that decides ownership or Already uploaded.

## Verification

Run npm run build. Against a configured test project verify: wrong-email/expired tokens fail; anonymous and other-user storage writes fail; arbitrary third files and files above 1 MB fail; incomplete uploads can retry; completion requires both files; completed invitations reject replacements; rescanning shows Already uploaded. Database/storage policies need a live Supabase integration check before production rollout.
