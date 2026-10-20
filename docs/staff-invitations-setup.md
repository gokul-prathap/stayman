# Staff invitations and password setup

## One-time deployment

### Using the Supabase Dashboard (no CLI required)

1. Apply migration 020 in the SQL Editor.
2. Open **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `invite-staff`. Replace the example code with the full contents of `supabase/functions/invite-staff/index.ts` and deploy.
3. In the function's settings, turn **Verify JWT** off. The function validates the user and platform-admin role inside its own code. This matches `supabase/config.toml`; do not remove the checks in the function.
4. Open **Edge Functions → Secrets** and add `STAFF_INVITE_ALLOWED_ORIGINS` with value `http://localhost:5173` for the local app. If using another port or `127.0.0.1`, use the exact browser origin instead. Add production origins separated by commas. Secrets apply without a redeploy.
5. Under **Authentication → URL Configuration → Redirect URLs**, add `http://localhost:5173/auth/set-password` (and the corresponding deployed app URL).
6. Retry **Send invitation**. If it still fails, open **Edge Functions → invite-staff → Logs** and check whether the request arrives. A missing function, incorrect project URL, gateway JWT rejection, or CORS configuration can prevent the app from reaching the function. SQL migration alone never deploys the email function.

### Using the CLI

1. Apply `supabase/migrations/202610200020_staff_invitations.sql` after migration 019. It adds invitation history, admin-only reads, server-side resend limits, and the authenticated acceptance RPC. It is safe to rerun.
2. Deploy `supabase/functions/invite-staff/index.ts` to the same Supabase project as the app:

   ```powershell
   supabase functions deploy invite-staff --project-ref YOUR_PROJECT_REF
   supabase secrets set STAFF_INVITE_ALLOWED_ORIGINS="http://localhost:5173,https://stayman.in" --project-ref YOUR_PROJECT_REF
   ```

   Use exact app origins, without paths or trailing slashes. `supabase/config.toml` disables the gateway JWT check for this function to support publishable keys. The function independently validates the user's token with Auth and calls `stayman_is_platform_admin` before using any administrative capability. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side: hosted Edge Functions provide the standard Supabase secrets. Never add this key to a `VITE_` environment variable.

3. In Supabase **Authentication → URL Configuration**, add the complete callback URLs for every app origin, for example:

   ```text
   http://localhost:5173/auth/set-password
   https://stayman.in/auth/set-password
   ```

   Set the Site URL to the production app URL. A localhost link only works on the machine running the development app; use a deployed URL when inviting managers on another device.

4. Configure Supabase Auth email delivery/SMTP. Check the **Invite user** and **Reset password** email templates. The simplest supported link is `{{ .ConfirmationURL }}`; it must preserve the supplied redirect. Do not replace these with the administrator's OTP-only template. If using custom token-hash links, use `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` for invitations and the same with `type=recovery` for password resets. The app handles these on `/auth/set-password`.

## Administrator workflow

Open `/godfather`, select the property, enter the team member's email, choose Manager/reception or Owner, and select **Send invitation**. No shared or temporary password is needed. New accounts receive an invitation link; existing accounts receive a password-reset link and keep their current password unless they choose a replacement. Existing owners are never silently demoted to manager.

The function assigns property membership with the caller's authorized RPC. Email sending and membership assignment are separate operations: a failure can leave a created Auth account or an assigned membership. The UI shows a retry instruction rather than pretending setup completed. Retrying after one minute completes the same property/email invitation record. Auth rate limits may require a longer wait. A provider accepting the message does not prove inbox delivery.

Recent invitation history shows Sending, Email sent, Needs retry, or Accepted. Resend is limited to once per property/email per minute. A successful resend invalidates neither the user's existing password nor their property assignment. Auth controls email-link expiry and token reuse. The history retains the latest attempt rather than a full email delivery audit.

## Manager workflow

The manager opens the email link, chooses and confirms a password of at least 12 characters, then opens their property workspace. Passwords are updated directly through Supabase Auth and never stored in app tables or visible to the administrator. Password setup records acceptance for the signed-in user's assigned properties. Supabase's configured password policy is enforced in addition to the client minimum.

The regular staff login now includes **Forgot password?**. The reset request always uses a neutral account-existence message after a successful API response. Expired/invalid links show an error with a fresh-link action.

## Verification

- `node tests/staff-invitations-database.mjs`: actual isolated PostgreSQL-compatible checks for authorization, cooldown, input validation, RLS, client write denial, acceptance scope, and resend.
- `node --test tests/staff-invitation-function.test.mjs`: mocked email delivery checks for origin rejection, caller authorization, new/existing account paths and partial failure.
- `npm run build`: application compilation.

Real delivery and cross-device email-link completion must be verified after deployment with a test team account. Local tests send no email and do not modify a live Supabase project.

Auth API references: [Invite users](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [password recovery](https://supabase.com/docs/guides/auth/passwords), and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
