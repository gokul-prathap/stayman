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
