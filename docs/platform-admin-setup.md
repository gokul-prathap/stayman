# Platform administrator setup

Apply `supabase/migrations/202610180014_platform_admin.sql` after migrations 006–013,
then apply `supabase/migrations/202610180015_admin_otp.sql`.
This migration does not make any existing owner a platform administrator.

Create your individual account in Supabase Authentication, then run this once in
the trusted Supabase SQL editor, replacing the email:

```sql
insert into public.stayman_platform_admins(user_id)
select id from auth.users
where lower(email)=lower('gokulprathap@rocketmail.com') and not is_anonymous
on conflict do nothing;
```

The same bootstrap is available in `supabase/seed/platform_admin.sql`. The email
is exactly as supplied: `gokulprathap@rocketmail.com`. Confirm the domain spelling
before creating the account or running the bootstrap. No login email is sent by
these SQL scripts.

## Configure administrator email OTP

In Supabase **Authentication → Email Templates → Magic Link**, set the body to:

```html
<h2>Your Stayman login code</h2>
<p>Enter this code to sign in: {{ .Token }}</p>
```

Email authentication must be enabled. Configure custom SMTP for production
delivery; the built-in sender restricts recipients and has low sending limits.
The email template is project-wide, so it changes other magic-link/OTP emails;
ordinary staff password login is unchanged. Existing guest invitation tokens
are application-specific and do not use this login template.

Open `/godfather`, enter your registered email, request a code and verify it. Account
creation is disabled in this login flow (`shouldCreateUser: false`). Codes and
expiry are validated by Supabase; the UI includes a 60-second resend cooldown.
The database requires admin membership plus an `otp` authentication-method claim
in the signed session token. Password-only, recovery and invite sessions cannot
use admin APIs or logo writes. Existing staff password sessions are prompted for
OTP when they open `/godfather`. Supabase represents OTP authentication through the
`otp` claim; this claim is not a separate email-only assurance level. This project
uses email OTP in the administrator UI. Authenticator MFA is not added by this change.

A platform administrator does not
need membership of any property. Ordinary owners and managers cannot use the
administrator RPCs or upload logos. Their property access policies stay unchanged.

## Onboard a property

1. Create the owner's account in Supabase Authentication using its account creation
   or invitation tools for initial property ownership. After migration 020 and the
   invitation function deployment, the panel can invite additional team accounts.
2. Choose **Add property**. Enter the property details, owner email and optional logo.
3. Save. Property creation and owner membership are one database transaction.
4. Use **Invite your property team** to send each employee a password-setup link.
   See `docs/staff-invitations-setup.md` for deployment and email configuration.
   Manager provides operational access. Profile and billing settings remain admin-only.
   This release does not add a separate reception permission tier.
5. The owner signs into the regular workspace to configure rooms and pricing.
   The property card links to that property's guest check-in page and reception QR
   remains available in Guests.

Logos accept PNG, JPEG or WebP up to 2 MB. They use a dedicated public branding
bucket, separate from private guest IDs, and appear in the property sidebar and
guest check-in header. Existing branding remains the fallback until a logo is uploaded.
Uploads happen after property creation; retrying a failed upload uses the same
property ID, preserving the property and membership already saved.

## Deployment checks

- Anonymous and ordinary staff sessions must be denied all admin RPCs and logo writes.
- A password-only session for an admin must also be denied admin RPCs and logo writes.
- An OTP session for a non-admin must not receive administrator access.
- Confirm the email contains a code, then test invalid codes, resend and successful verification.
- An admin without property membership must be able to open `/godfather` and onboard.
- Unknown owner email must leave no newly created property behind.
- Owner A must not be able to read property B's operational records.
- Upload a logo and confirm it appears on the public check-in page and staff sidebar.
- Assign a Manager and verify sign-in sees only assigned properties.

Do not put a Supabase service role key in browser environment variables. Access removal, property suspension and property deletion are not exposed by this panel.
New team accounts can be provisioned through the protected invitation function;
platform-admin bootstrap remains trusted SQL only.
