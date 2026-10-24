## Flat private-room rates (048)

After migration 047, run `supabase/migrations/202610240048_aiosell_flat_room_rates.sql` in Supabase SQL Editor, then deploy the updated frontend. No Edge Function, secret or scheduler change is needed for this patch. Nothing has been applied automatically.

This allows an Aiosell occupancy plan below the included guest allowance (for example, one guest when the base price includes up to two guests). Existing pricing already charges the base amount for fewer guests; additional guests above the allowance still incur the configured extra charge. The remote plan occupancy and maximum-capacity checks remain enforced. No stored property prices or mappings are changed by this migration. Use actual confirmed guest capacities; never infer occupancy from S/D suffixes.

## Property administration workspace (047) — local changes awaiting release

Keep these changes local until the remaining admin work is approved for release. No SQL or deployment has been performed by this implementation.

At the final release, retain the order below. Apply only migrations that are not already recorded as applied:

1. Deploy the updated backward-compatible `aiosell-sync` worker as described below.
2. Apply migrations in order: 044 → 045 → 046 → **`202610240047_admin_workspace.sql`**. Never rerun an older Aiosell migration after 047: it retains separate verified snapshots for saved and candidate hotels.
3. Build and deploy the frontend. No new API secrets, webhook change, cron job or manual data cleanup is required by 047.

047 adds admin metrics, property-scoped access management with a last-owner guard, activity summaries, admin pricing through the existing unit rates, issued-invoice listing, and durable guided mapping transitions. It does not delete historical REVIEW folios, issued snapshots, bookings, payments or existing mappings. Existing billing tax and numbering logic remains unchanged.

Platform navigation is Home / Properties / Users & access. A selected property has Overview, Property details, Rooms & beds, Pricing, Users & access, Billing, Aiosell and Activity tabs. Configuration remains platform-admin-only; owner controls use the same saved configuration. The embedded owner preview is read-only and does not impersonate an account.

For mapping changes, review matches and choose **Save & restart updates**. Stayman saves the proposed change, closes the old mapped categories over the existing rolling 90-day window, and attempts delivery. After inventory acceptance, verify old zero availability in Aiosell and finish the saved change. Closing all old categories is conservative because the existing pause guard requires full old-inventory closure. A failed closure keeps old matches and the saved proposal; a failed restart keeps the new matches. Previously approved unchanged-hotel connections can restart, while new/replaced associations require owner review. Existing room/site closures and automatic-update preferences are retained. Linked OTA bookings continue to block hotel replacement.

Local previews: `/preview/admin` exercises the production configuration component using a network-free synthetic adapter, including unconfigured/incomplete/ready/connected, failed lookup, linked-booking block and delivery outcomes. `/preview/aiosell` exercises owner operations. Neither preview changes real properties. Real categories are fetched only by authenticated admin setup, never copied from the samples.

Local verification: `npm run build`; `node --test tests/*.test.mjs`; mocked Playwright checks `qa/admin-workspace-smoke.py`, `qa/aiosell-admin-smoke.py`, `qa/aiosell-owner-smoke.py` (requires the local preview server on port 4173). Test requests are intercepted; the checks do not contact live Supabase or Aiosell. Live API/OTA acceptance must be checked after release using the actual property configuration.

## Owner online-sales screen and administrator setup (046)

This replaces the owner hotel-ID/mapping workflow described in 045. Keep 045 applied; do not rerun older migrations after 046.

Release in this order:

1. Deploy the updated worker first: `npx supabase@latest functions deploy aiosell-sync --project-ref lyyjidxpskfcuksfhjpy --no-verify-jwt --use-api`.
2. After migrations through 045, run `supabase/migrations/202610240046_aiosell_owner_operations.sql` in Supabase SQL Editor. It updates the existing `stayman-aiosell-sync` cron job when present, without creating a second job. No new secrets or webhook deployment.
3. Build and deploy the frontend. Local development preview: `npm run dev`, then open `/preview/aiosell` on that local URL. This anonymous preview is labelled simulated, uses synthetic data and never contacts Aiosell/Supabase.
4. Platform admin > property setup > Aiosell configuration: fetch/verify the actual hotel; match Stayman units to fetched categories; configure included/max guests and extra-guest rules; prepare the offering for owner review. Verify returned inventory-channel targets with Aiosell before enabling owner booking-site controls. Choose their initial sales preference explicitly; re-verification preserves existing owner preferences.
5. Owner > Settings > Aiosell: review the prepared read-only rooms/prices and Start selling online. The page distinguishes desired settings, Aiosell acceptance, pending delivery and failure. No technical mapping fields or secrets are returned in the owner state.

Existing active connections keep their delivery behaviour, but their owner controls show setup incomplete until an administrator verifies/prepares them. To change existing mappings, complete the guided old-inventory closure and pause. Previously closed rooms are remembered and restored when preparing replacement matches. Existing linked OTA bookings still block unsafe hotel replacement.

Automatic updates is now independent of receiving reservations. Turning it off leaves incoming webhooks enabled and does not close remote sales. Manual room/site sales changes queue and attempt delivery immediately, including while automatic updates are off. In that case only sales data is sent, not pending price changes. An already running update may finish. Closures/openings apply to the stated rolling 90-day window; the UI does not promise all future dates.

A booking-site switch is available only for an administrator-verified inventory target returned by Aiosell. Unsupported/unknown setup is not guessed. Restrictions combine room closure OR site closure OR affected-category review hold. Reopening one scope does not reopen the others. Aiosell success is displayed as Sent to Aiosell, never proof of OTA application.

Private-room guest pricing is explicit. A base amount can include 2 guests with an extra-guest charge for 3, but each advertised guest count needs a correctly configured remote plan. Do not relabel single/double plans as 2/3 guests. The configured guest count must match Aiosell's returned occupancy when provided. Missing plan coverage blocks owner activation. No property prices or occupancy limits are hardcoded outside the simulated preview.

Bookings needing attention has a guided review dialog. Owners can link a checked existing reservation, or create a new book-event reservation after duplicate/availability checks. Modifications/cancellations require correcting the actual stay/payment state first. Failed creation rolls back partially inserted guests/bookings; repeated creation returns the linked booking. Review holds close affected categories rather than unrelated property inventory.

See `docs/aiosell-capabilities.md` for verified API boundaries and remaining limitations.

## Guided Aiosell mapping and multiple rate plans (045)

Release steps (local source changes do not update the live app):

1. Redeploy the backward-compatible worker from the project folder:
   `npx supabase@latest functions deploy aiosell-sync --project-ref lyyjidxpskfcuksfhjpy --no-verify-jwt --use-api`
2. After migrations through 044 are applied, run `supabase/migrations/202610240045_aiosell_guided_mapping.sql` in Supabase SQL Editor.
3. Build/deploy the frontend using the existing hosting workflow. No webhook redeployment, new secret or scheduler change is needed.
4. In Settings > Aiosell, choose Manage mappings (if already connected). Enter the hotel code supplied by Aiosell, Connect & fetch units, confirm unit matches and property details, then Review activation > Save & activate.

Connect previews mappings without saving/changing the existing connection. One physical unit is selected per category; exact-name suggestions always require owner confirmation. Legacy grouped mappings remain stored until closed and explicitly changed. Unmatched Aiosell categories are not closed by Stayman: verify them in Aiosell before activation. Non-INR activation is blocked.

Each mapping can contain multiple rate plans while publishing inventory only once. All selected plans follow the unit price by default. Pricing > Channel rate-plan prices supports explicit independent fixed prices. Fixed prices do not change when base prices change. Confirm single/double plan meanings with Aiosell; no automatic occupancy multiplier is inferred. Bookings received on either selected plan use the same inventory mapping.

To replace/remove mappings: Change mappings or pause connection > Close inventory to change mappings. The UI saves stop-sell and requests sync, waits for acknowledgement, then requires the owner to verify zero availability in Aiosell before Pause & unlock mappings. Failures leave mappings intact. Refresh/retry continues the process after reload. After remapping, explicitly select Reopen all matched categories when activating if you want the closed categories back on sale; otherwise their stop-sell state is preserved. Provider access errors must be resolved with Aiosell; do not reset database guards to bypass closure. Hotel changes after linked OTA bookings still require migration/support, preserving booking identity.

For the supplied property: hotel code `1b8ae0cf67`; match eight individual MDR/MDRA beds and two private-room categories after fetching. Confirm every rate plan is returned by Aiosell. These identifiers are not hardcoded for other properties.

## Optional OTA phone repair (044)

Run `supabase/migrations/202610230044_ota_optional_phone.sql` in Supabase SQL Editor after the existing Aiosell setup (027 onward). No frontend or Edge Function deployment is required for this repair. The existing phone-length rules from 010 must exist.

Missing/invalid/non-international inbound OTA numbers become NULL with `ota_contact_withheld=true`; the booking notes request a verified contact number at check-in. Valid international numbers are saved without punctuation. Original event payload remains available for review. Direct guest and completed web-check-in validation remain strict.

Previously received REVIEW events are not automatically replayed: duplicate delivery still deduplicates. Use the existing owner reconciliation flow after verifying the latest OTA booking, or ask Aiosell for a new test booking ID to validate the fix. Do not delete event rows or disable phone validation globally.

## Guest review, policies and no-show update (039-043)

1. Apply existing migrations through 038 first. Resolve migration 035's payment-allocation guard if it reports existing receipts needing reconciliation.
2. In Supabase SQL Editor, run `scripts/admin/apply-guest-operations-update.sql`. This contains migrations 039-043 in order. Alternatively apply those five migration files individually.
3. From the project folder, redeploy the updated worker: `npx supabase@latest functions deploy aiosell-sync --project-ref lyyjidxpskfcuksfhjpy --no-verify-jwt --use-api`. No new secrets or scheduler setup are required.
4. Build and deploy the frontend through the existing hosting workflow.
5. As owner, open Settings and save the cancellation/no-show policy. New direct bookings capture that version; older bookings and OTA bookings require owner review of the applicable terms.
6. Test with a test booking: review a no-show, confirm nobody arrived, inspect fee/refund due, and record only payments or refunds actually made. Verify released availability in Aiosell and the separate no-show delivery status.

Dashboard review cards start collapsed below the summary cards. Owners can correct personal details with a reason and visible edit history. Original ID submissions and issued invoices remain unchanged. Historical arrival/stay corrections require an owner reason and existing conflict-free allocations. Paying does not automatically check anyone out.

Whole-booking no-show requires confirmation that nobody arrived. Partial group no-shows remain unavailable until individual guests can be linked reliably to room/bed allocations. Uncertain Aiosell delivery requires provider verification before retrying; unsupported channels require manual confirmation. OTA commission and payout calculations are deferred in `docs/future-changes.md`.

## Overdue departures and missed check-in review (038)

Apply `supabase/migrations/202610230038_overdue_departures.sql` after 037, then deploy the frontend. No scheduler or Edge Function deployment is needed. The dashboard uses the existing shared notification request for two cards: web check-in tasks, and overdue departures with missed arrivals/past-date submissions. Lists are capped at 100 per group and show full counts.

Overdue is a read-only flag for CHECKED_IN bookings whose departure date plus the property's checkout time has passed, evaluated in its timezone. Extensions with a future departure are excluded. PENDING bookings with completed web check-in and past checkout time are shown for review, as are expired unallocated public submissions. No reservation status, payment or room availability is changed automatically. Full payment never proves arrival/departure. Cancel/no-show reviews must retain the existing refund/accounting process. Groups remain booking-level until guest-to-room allocation exists.

## Staff recognition on private check-in links (037)

Apply `supabase/migrations/202610230037_checkin_property_context.sql` then update the frontend. The public property profile now includes the resolved property ID, allowing the separate Stayman login to verify staff assignment even when a private link has no property parameter. Stored sessions that omit is_anonymous are no longer rejected before the server membership check. Anonymous or unassigned sessions still do not get Add another guest. No Edge Function deployment.

## Shared-browser public check-in

Frontend-only update: guests see Already completed after submission and cannot start another guest from that completion screen. Verified property staff see an explicit Add another guest button. No automatic reset is performed. The button rotates only the isolated guest session and opens a fresh public check-in for the same property; staff login and completed submissions are preserved. From a completed private invitation, it switches to the property's public check-in without overwriting the original invitation. No QR rescan, SQL or Edge Function changes are needed.

## Web check-in feedback

Frontend-only update: photo preparation/crop/storage failures are shown beside the affected document, including on the review screen. First successful completion says Successfully submitted. Previously completed guest links say Already submitted; a separate signed-in application session uses Check-in completed. Guest and application sessions remain separate; these messages do not grant access or allow completed submissions to be overwritten. No SQL or Edge Function deployment is needed.

## Guest home address and invoice prefill (036)

Apply `supabase/migrations/202610230036_guest_address.sql` after 035, then deploy the frontend. No Edge Function deployment or new secrets. Web check-in collects an optional home address (5?500 characters when provided), includes it in the review screen and keeps it in that individual's submission. Old submissions remain valid.

Invoice preparation/checkout use the latest completed submission explicitly linked to the booking contact for this reservation. Unlinked or other group members are excluded. Existing saved billing addresses take precedence, including a deliberately blank value; company billing addresses remain editable. Issued invoice snapshots are unchanged. No address is added to public property responses or guest-list summary rows.

## Invoice popup on the current page

Frontend-only update: guest register, reservation details and invoice preparation buttons open checkout/finalisation over the existing page. Once eligible, the same popup shows the saved invoice in an embedded print view. Closing returns to the unchanged underlying page; no separate blank tab is opened. Customer-address collection in web check-in is unchanged.

## Invoice dialog styling and setup state

Frontend-only update: the standalone invoice route now imports its form/button styles directly. Closing the checkout dialog leaves a visible booking/status card. Printing waits for the invoice document to render. A paid, checked-out booking still requires configured property billing details (Platform admin ? select property ? Billing). Confirm actual GST registration status rather than assuming it; issued invoices retain their saved snapshots. No additional SQL or Edge Function deployment is needed for these UI changes.

## Older folio payment schema (035)

For `column accommodation_applied does not exist`, run `supabase/migrations/202610230035_folio_payment_schema.sql` in Supabase SQL Editor. It safely adds the column when the older payment table is empty, or does nothing when the column already exists. If existing receipts lack this allocation field, it stops without changing data: reconcile their accommodation portion before continuing to avoid double-counting payments. Do not rerun the original table-creation migration or delete payments.

## Invoice permissions repair (034)

If invoice loading reports `permission denied for function stayman_invoice_context`, apply `supabase/migrations/202610230034_invoice_permissions.sql` after 033 in Supabase SQL Editor. This restores authenticated RPC execution; anonymous access stays blocked and property authorization remains enforced inside the functions. No Edge Function deployment is needed. If the authenticated grant is already present, sign out and back in on the same origin as the invoice tab (localhost and production have separate sessions).

## Checkout and invoice printing (033)

Apply `supabase/migrations/202610230033_checkout_invoices.sql` after 032, then deploy the frontend. No Edge Function deployment or new secrets are needed.

Administrator approval is removed. Invoice printing requires the whole booking to be checked out and the complete folio balance to be zero. Billing configuration and GST customer address checks remain. Save billing details and record any extra/tax payments in Invoice preparation. Existing REVIEW drafts become editable drafts; issued invoices keep their numbers and snapshots.

Use **Check out / print invoice** in the reservation, or Print/Download in the guest register. Select departing group members, leaving extended members unchecked. This records partial departure, but does not release individual rooms: the current model has no guest-to-allocation association. Review/adjust room allocations separately; the common invoice remains open until everyone leaves. Checkout retains charges and booked history, releases remaining inventory only on full checkout, and never applies an automatic refund. Use separate bookings when individual invoices are needed.

# Stayman deployment instructions

Guest table/filter layout adjustments after 032 require only a frontend deployment.
The table retains gender and the normal guest columns; expand a row for booking
totals, assignments and ID/invoice actions. **Download invoice** uses the existing
invoice print layout: select **Save as PDF** in the browser print window. Drafts
stay clearly marked and are not issued automatically.

## Guest gender and compact register (032)

Run `supabase/migrations/202610230032_guest_gender.sql` after 031 in Supabase SQL
Editor, then deploy the frontend. No Edge Function deployment or new secret is
needed. New web check-ins require a gender choice, including Prefer not to say.
Refresh older open web-check-in tabs after deploying the new client.

Existing completed submissions are preserved. Their missing answers are not
guessed or relabelled as a decision not to share. Explicitly linked guest records
receive the latest completed answer for that person; group members never overwrite
the booking contact merely because they share a reservation. Dorm allocation
restrictions remain enforced; check-in completion does not move an existing allocation.

Verify a new walk-in, a linked group member, and the guest register on mobile.
Guest rows expand to show gender, contact/travel details, View / ID and invoice
actions. Filters and pagination still operate server-side.

## Expense reports update (031)

1. In Supabase SQL Editor, run
   `supabase/migrations/202610230031_expense_reports.sql` after migrations through
   030. This creates the expense ledger and private receipt storage policies,
   preserves existing bills, and backfills their recorded payments once.
2. Deploy the frontend. No Edge Function redeployment or new secret is needed.
3. Test a partially paid bill, a later payment, a supplier refund and a staff
   reimbursement. Confirm a previous-period unpaid balance remains correct.
4. Open **Reports → Income & Expenses**, check the electricity/laundry comparison,
   download CSV, and use **Print / Save PDF**. Test receipt upload and viewing with
   a property staff account. See [expense setup](operations-expenses.md).

Apply the database update before publishing the client. Do not reapply migrations
012/013/026 afterward, since they contain older expense/workspace RPC definitions.

Changing prices, mappings, restrictions or reservations does NOT require deployment.
Deployment is needed when the application code changes. Database migrations and
Edge Functions are deployed separately from the frontend at stayman.in.

Saving Pricing now immediately attempts Aiosell sync for an enabled connection and
shows the rate result on Pricing. There is no need to visit Aiosell Settings after
ordinary price changes. Saved prices remain queued if delivery fails or another
worker is active. The scheduler is still needed for unattended retries and booking/
maintenance inventory changes. This workflow update needs frontend deployment only.

Pricing now offers a Pricing view selector: By room category, or Individual rooms
and beds. Individual rates are stored per physical unit. Switching views preserves
edits, and saving a category with Mixed rates preserves its individual prices unless
you explicitly enter a shared category price. Apply to all still fills every unit
of the selected type. This UI change needs frontend deployment only; no additional
SQL migration or Edge Function deployment. Aiosell mappings containing different
individual rates still require separate mapped categories or matching local prices.

## What needs deployment?

| What changed? | What to do |
|---|---|
| Price in Pricing, booking, mapping or stop-sell | Save in Stayman. Scheduler sends pending changes; use Sync now for a manual test. No deployment. |
| React pages, messages, popups or styling (`src/`) | Build and deploy frontend only. |
| `supabase/functions/aiosell-sync/` | Redeploy `aiosell-sync` only. |
| `supabase/functions/aiosell-webhook/` | Redeploy `aiosell-webhook` only. |
| Shared Aiosell helper (`supabase/functions/_shared/aiosell.mjs`) | Redeploy both Aiosell functions that import it. |
| New SQL migration | Apply that migration once, in order. Deploy any accompanying function/frontend changes afterward. |
| API password, allowed origins or other Edge Function secrets | Update Supabase Edge Function secrets. No source-code deployment needed when only values change. |
| Worker secret | Update the Edge Function secret AND its matching scheduler Vault secret. |
| Scheduler SQL | Update the cron job only. No change needed for ordinary rate or booking updates. |

## Open the correct terminal folder

Use a local terminal on the computer containing this project.

PowerShell:

```powershell
Set-Location -LiteralPath "D:\Realm of coding\react\stayman"
```

Command Prompt (cmd):

```cmd
cd /d "D:\Realm of coding\react\stayman"
```

The deployment commands below use `npx`; no global Supabase CLI install or Docker
is required. Accept the package download if prompted. Authenticate when needed:

```powershell
npx supabase@latest login
```

Keep login tokens, passwords and service-role keys private. Do not commit them.

## Database updates

In Supabase Dashboard > SQL Editor, open a new query, paste the contents of the
required file under `supabase/migrations/`, and Run. Apply migrations in numeric
order. Do not paste Markdown backticks into SQL Editor. Do not rerun the entire
migration folder to apply one new migration.

For the current Aiosell implementation, prerequisites are migrations through 026,
then:

1. `202610220027_aiosell_channel_manager.sql` — initial integration.
2. `202610220028_aiosell_sync_results.sql` — partial sync and channel targets.
3. `202610220029_aiosell_follow_pricing.sql` — rates follow Pricing.
4. `202610220030_aiosell_pause_after_inventory_closure.sql` — pause after current
   zero-inventory acknowledgement even when restrictions remain pending.

If 027 and 028 are already applied, apply ONLY 029 for the latest Pricing change.
Do not rerun 027/028 after 029; 029 wraps their functions. Apply database changes
before deploying the code that depends on them.

## Deploy the Aiosell sync function

```powershell
npx supabase@latest functions deploy aiosell-sync --project-ref lyyjidxpskfcuksfhjpy --no-verify-jwt --use-api
```

## Deploy the reservation webhook

Only needed initially or when webhook/shared code changes:

```powershell
npx supabase@latest functions deploy aiosell-webhook --project-ref lyyjidxpskfcuksfhjpy --no-verify-jwt --use-api
```

These two functions validate owner/scheduler or webhook authentication internally.
Keep their `--no-verify-jwt` setting; it is not a command to apply to unrelated functions.
`--use-api` performs server-side bundling, without Docker.

## Deploy the frontend to stayman.in

```powershell
npm run build
```

A successful build only creates `dist/` locally; it does not publish stayman.in.
Deploy the updated source through the frontend hosting project's existing workflow
(or upload `dist/` if that hosting setup uses manual uploads). If hosting deploys
from Git, new files must be committed and pushed before the host can build them.
Supabase function deployment does not publish the frontend.

For localhost testing, `npm run dev` runs current source without publishing it.

## Current Pricing change: exact release steps

1. Apply migration 029, provided 027/028 are already applied.
2. Redeploy `aiosell-sync` using the command above.
3. Build and deploy the frontend. No webhook redeployment is needed for this change.
4. In Pricing, set the intended room/bed prices and save. Each mapped category must
   have one matching, positive rate across all its active units.
5. Settings > Aiosell should show Following Pricing rather than a price-entry field.
6. Click Sync now. Check the rate-stage result, then verify the price in Aiosell.

After this release, ordinary price changes require ONLY saving Pricing. Automatic
delivery requires a running scheduler. Until configured, use Sync now after saving.

## Automatic sync setup

Follow `docs/aiosell-setup.md`, including Edge Function secrets, Vault and
`supabase/aiosell-schedule.sql`. This setup is normally done once. Check the cron
job is active and monitor failures. A deployed backend can sync while staff close
the browser, provided Supabase and its scheduler remain available.

## Common errors

| Error | Fix |
|---|---|
| Entrypoint path does not exist | Open the correct local checkout. `Test-Path .\supabase\functions\aiosell-sync\index.ts` must return True in PowerShell. |
| `.env.local` unexpected character in variable name | Save as UTF-8 without BOM. Use plain `NAME=value` lines; never paste secrets into chat for troubleshooting. |
| Function or column missing | Check that the required SQL migration was applied before deploying its code. |
| Origin not allowed | Update `AIOSELL_ALLOWED_ORIGINS` with the exact browser origin, including protocol and local port, without a trailing slash. |
| Inventory/rates Sent, restrictions Pending | Partial sync: no valid restriction target was provided. It does not require another deployment. Add only Aiosell-confirmed channel IDs. |
| Mapped units have different prices | Align the units' prices in Pricing or split the Aiosell room categories. Save, then sync. |
| New UI is missing on stayman.in | Deploy the frontend; deploying an Edge Function alone does not update the website. |

## Discounts and markups

Aiosell supports a channel multiplier. In its UI: Channel Manager > OTA Mapping >
select OTA > Channel Multiplier. `0.90` is 10% lower, `1.10` is 10% higher, `1.00`
is unchanged. Its Channel Multiplier API also accepts a factor and target channels.

Current Stayman sends the base price from Pricing; it does NOT yet configure an
Aiosell multiplier or show a discount-percentage control. A percentage adjustment
set in Aiosell can affect OTA prices on top of the base rate Stayman sends. Do not
also reduce the base rate by the same percentage unless the combined reduction is
intentional. OTA promotional offers may apply separately.

Example: base price 1200, multiplier 0.90 => adjusted price 1080, before any other
channel pricing rules/promotions. To remove that adjustment, restore multiplier 1.

Sources:
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/reference/cli/supabase-functions-deploy
- https://apidocs.aiosell.com/api/channel-multiplier
- https://support.aiosell.com/portal/en/kb/articles/how-to-apply-channel-multiplier-aiosell-channel-manager
