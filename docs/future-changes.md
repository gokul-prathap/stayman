# Future changes

## Expense operations beyond the financial report release

- [ ] Cash drawer opening/shift closing: opening cash + guest cash receipts − cash
  spending − handovers compared with actual counted cash, with a reason for differences.
- [ ] Optional owner approval thresholds for larger expenses, without blocking ordinary reception purchases.
- [ ] Category budgets and occupancy-aware alerts based on sufficient comparable data.
- [ ] Accounting-period closing and explicitly approved adjustments; current historical reports reflect later bill corrections.

## Aiosell sync efficiency for multiple properties

Planned improvements; these are not implemented yet. Keep the one-minute scheduler
check so booking and cancellation inventory changes are sent promptly. An idle
check should not invoke an Edge Function or call Aiosell.

- [ ] Retry only failed or pending stages instead of resending accepted inventory and rates. Track acknowledgements by property, stage and revision so later changes are never skipped.
- [ ] Treat missing restriction channel targets as a configuration issue. Resume that stage when configuration changes rather than retrying the entire sync indefinitely; inventory updates must continue independently.
- [ ] Send only changed inventory dates and categories, with an initial full sync and periodic full reconciliation. Preserve stop-sell closure checks, booking/cancellation correctness, leases and retry safety.
- [ ] Add per-property usage metrics for sync attempts, outgoing requests, retries, payload bytes and last acknowledged inventory revision. Measure realistic traffic across 50 properties before choosing plan capacity.
- [ ] Confirm Aiosell's production request limits and any API charges with their team.

Capacity planning must distinguish the shared scheduler's database checks from
Edge Function invocations and outgoing Aiosell requests. Include frontend calls,
webhooks, database load and bandwidth when assessing Supabase plan limits.

## Before launching on a purchased domain

The production app domain is `https://stayman.in`.

- [ ] Connect the domain to the hosting provider and confirm HTTPS works.
- [ ] In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://stayman.in`.
- [ ] Add `https://stayman.in/auth/set-password` to **Redirect URLs**. Keep `http://localhost:5173/auth/set-password` if local development is still needed.
- [ ] In **Edge Functions → Secrets**, update `STAFF_INVITE_ALLOWED_ORIGINS` to include `https://stayman.in`. For development and production together, use `http://localhost:5173,https://stayman.in`. Use exact origins without paths or trailing slashes.
- [ ] Confirm the production app uses the intended Supabase project URL and publishable key, and that required migrations and `invite-staff` are deployed to that same project. Never put service-role keys in browser environment variables.
- [ ] Review the **Invite user** and **Reset password** email templates for hardcoded localhost links. Preserve the configured redirect; see [staff invitation setup](staff-invitations-setup.md).
- [ ] Send a test invitation from the deployed domain and open it on another device. Verify password setup, property access, password recovery, and invoice printing.
- [ ] Resend any outstanding invitations created from localhost so recipients receive a reachable production link.
- [ ] Revoke temporary development admin password access before production launch; continue using administrator OTP login. See [billing and development login setup](billing-setup.md).

Invitation and password-reset links use the app's current browser origin, so the domain does not need to be hardcoded in application code. Open the production site when sending real invitations. Pushing code does not update Supabase URL settings or Edge Function secrets.
