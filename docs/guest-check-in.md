# Permanent office QR — current setup

The office QR contains one fixed URL: https://YOUR-SITE.vercel.app/guest-check-in.
For local testing open http://localhost:5173/guest-check-in directly.
No invitation token, email login, PIN or per-guest SQL is required.

1. Apply migrations 001, 002, then 003 (202610090003_permanent_guest_qr.sql). If 001/002 already ran, run only 003.
2. Enable Supabase Anonymous Sign-Ins.
3. Restart the local server or deploy these changes with the existing environment variables.
4. Encode the fixed deployed URL in your reception QR.

Supabase reserves at most 100 new submissions per Asia/Kolkata calendar day, at page opening. Abandoned drafts count to bound storage creation. Each session has one record and exactly two image paths. Reopening an active draft does not consume another slot. Completed sessions show Already uploaded. Clearing browser storage creates another session but still consumes the same global daily allowance. Expired drafts renew on a later day and consume that day's allowance; partial image paths are reused. Legacy invitation URLs remain supported.

The counter is server-side, locked transactionally; clients cannot edit it. The daily quota table is guest_checkin_daily_usage. At capacity the page says Daily check-in limit reached. Please contact the manager. Storage capacity errors show an uploads-unavailable/contact-manager message. The daily limit is not a measure of the Supabase account's actual remaining bytes. Stored images accumulate across days, so retention/cleanup is still needed.

A public QR cannot prove someone is a real guest. This limits submissions, not all network requests or malicious quota exhaustion. CAPTCHA integration and request throttling remain operational follow-ups. Check existing staff-table RLS before enabling anonymous sessions, which use the authenticated role.

## Earlier invitation setup and image processing reference

# Guest QR check-in

The standalone route is /guest-check-in. It uses the existing Supabase client and shared Input/Button styling. Identity files use private Storage; guest details live in guest_checkin_invitations. This does not create a reservation or mark a room occupied.

## Setup

1. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Never place a service-role key in Vite.
2. Apply 202610090001_guest_checkin.sql, then 202610090002_guest_checkin_without_email_auth.sql from supabase/migrations. If the first migration is already applied, run only the second.
3. In Supabase Authentication settings, enable Anonymous Sign-Ins. No email templates, SMTP or magic links are required for this guest flow. A guest session is created automatically using a separate browser storage key from staff authentication.
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

Possession of the secret, hashed, expiring invitation grants access. Email is a required contact field, not proof of identity. Anyone with a draft invitation link can open it, so give each guest a private link rather than a shared public QR. A new browser can resume a draft, transferring upload access to its session. RLS and RPC permissions block requests without a guest session/invitation from uploading and direct changes to invitation status/details. Private bucket policies allow exactly front.jpg and back.jpg per invitation (1 MB JPEG each). Resubmitting after a partial failure overwrites those slots without accumulating files. Repeated scans show Already uploaded after completion, including on another browser. Completed links return only a receipt; they do not transfer ownership or disclose contact details.

Original photos are capped at 10 MB in the UI, cropped to the selected document area and resized to at most 1500 pixels on the longest edge, re-encoded as JPEG (removing original metadata), and compressed below 1 MB. The UI supports JPEG/PNG/WebP only. Confirm the compressed identity details are readable before submission.

Completed submissions are locked against subsequent guest writes. Reception corrections require a new invitation or an administrator-managed reset. Expired draft cleanup, retention rules, staff review, malware/content inspection, strict request-rate limits, and invitation provisioning integration are operational follow-ups. Storage MIME limits alone do not prove uploaded bytes are a legitimate identity image; do not serve these files as public or active content. Audit existing storage policies: permissive policies for authenticated users can widen access to this bucket.

The commented future IP/network hook is in guestCheckinService.js. Implement it in trusted server code only. Shared Wi-Fi/IP cannot identify a person and should remain a supplementary abuse signal, not the mechanism that decides ownership or Already uploaded.

## Verification

Run npm run build and node --test tests/guest-check-in.test.mjs. Against a configured test project verify: invalid/expired draft tokens fail; anonymous and other-user storage writes fail; arbitrary third files and files above 1 MB fail; incomplete uploads can retry; completion requires both files; completed invitations reject replacements; rescanning shows Already uploaded. Database/storage policies need a live Supabase integration check before production rollout.

## Anonymous session rollout

Existing projects: run only migration 202610090002_guest_checkin_without_email_auth.sql if migration 001 was applied. Enable anonymous sign-ins and redeploy the app. Existing invitation links still work. No magic-link implementation is needed because guests no longer verify email.

Anonymous sessions use the authenticated database role. Before enabling them, verify that staff/reservation tables require staff authorization, rather than granting all authenticated users access. The guest migration scopes its own policies to an invitation owner; it does not change existing staff-table policies. Supabase recommends CAPTCHA and anonymous-account cleanup for public deployments. CAPTCHA UI integration is not included here; enabling mandatory CAPTCHA without integrating its token will block anonymous sign-in.

The invitation must remain a high-entropy per-stay secret. Contact email is unverified. Store only the generated token hash on the server; never publish the QR to a public page. For a second-device draft resume, only the latest claiming session may finish it.

See https://supabase.com/docs/guides/auth/auth-anonymous for anonymous sign-in configuration and operational limits.

## Guest review and upload

Opening a valid invitation link creates the guest session automatically and opens the form. Enter contact/stay details, select the two document photos, and click Review details and photos. This shows the compressed images and a summary of the submitted details. Guests can go back to edit/replace photos; retained photos remain selected when returning to the form. After confirming that the details are correct and the images readable, Confirm and upload saves the two private JPEG files and completes the guest record.

Review is the guest's confirmation, not email ownership verification or automated ID/name authentication. No verification email is sent. Compression happens locally before review; uploading happens only after confirmation. The backend still enforces the invitation and storage policies from migrations 001 and 002.

For local testing use the invitation SQL above, replacing https://YOUR-APP with http://localhost:5173. For phone testing use your deployed HTTPS address. Enable Anonymous Sign-Ins and apply both migrations first.

## Mobile layout and cropping

The guest page uses larger touch controls, 16px mobile inputs, stacked sections, image upload cards and a progress indicator in the existing slate palette. Selecting a photo opens a touch crop editor. Drag over the photo to choose the document area, or use the margin sliders; Reset keeps the whole image. Crop can be reopened from the photo card. Cancelling preserves the previous photo.

Cropped photos target 450 KB, trying JPEG quality 0.76/0.66/0.56 and maximum dimensions of 1500/1250/1000 pixels. If the target cannot be met, a result up to the existing 1 MB bucket limit is allowed. Review the compressed image for readable text. No database changes are required for this update.

## Live validation
Fields show inline errors while typing or on blur. Arrival must be today or later in Asia/Kolkata; departure must be on/after arrival. Indian mobile numbers require 10 digits starting with 6–9; international numbers require +country code and 7–15 digits. Travel locations require at least two characters including a letter. Apply migration 004 to enforce phone/date rules server-side.
