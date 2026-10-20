# Future changes

## Before launching on a purchased domain

Replace `https://yourdomain.com` below with the final HTTPS app URL.

- [ ] Connect the domain to the hosting provider and confirm HTTPS works.
- [ ] In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://yourdomain.com`.
- [ ] Add `https://yourdomain.com/auth/set-password` to **Redirect URLs**. Keep `http://localhost:5173/auth/set-password` if local development is still needed.
- [ ] In **Edge Functions → Secrets**, update `STAFF_INVITE_ALLOWED_ORIGINS` to include `https://yourdomain.com`. For development and production together, use `http://localhost:5173,https://yourdomain.com`. Use exact origins without paths or trailing slashes.
- [ ] Confirm the production app uses the intended Supabase project URL and publishable key, and that required migrations and `invite-staff` are deployed to that same project. Never put service-role keys in browser environment variables.
- [ ] Review the **Invite user** and **Reset password** email templates for hardcoded localhost links. Preserve the configured redirect; see [staff invitation setup](staff-invitations-setup.md).
- [ ] Send a test invitation from the deployed domain and open it on another device. Verify password setup, property access, password recovery, and invoice printing.
- [ ] Resend any outstanding invitations created from localhost so recipients receive a reachable production link.
- [ ] Revoke temporary development admin password access before production launch; continue using administrator OTP login. See [billing and development login setup](billing-setup.md).

Invitation and password-reset links use the app's current browser origin, so the domain does not need to be hardcoded in application code. Open the production site when sending real invitations. Pushing code does not update Supabase URL settings or Edge Function secrets.
