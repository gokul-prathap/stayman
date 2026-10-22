# Aiosell sandbox integration

## Inventory discrepancy diagnostics

The sync function now checks that outgoing availability never exceeds the mapped
unit count, and rejects invalid snapshots before the inventory request. Its saved
inventory result includes a bounded trace across the first 14 dates (at most 60
room/date values), hotel code and snapshot revision, without guest data or credentials.
Sent and returned values are stored together in one array; verification stores only
summary counts. The full outgoing 90-day payload is still validated and synced.
Existing saved diagnostics retain their old shape until the next sync.

Owner-triggered syncs (including Pricing saves) add one Fetch Inventory request to
compare those sampled values. Scheduled syncs add no read-back traffic. Mismatches
or missing returned values mark inventory Pending, preserving retry and preventing
closure from being treated as acknowledged by the pause guard for that attempt.
An unavailable read-back remains explicitly unverified, not claimed as matched.
Even a match proves only the sampled values at that moment, not OTA delivery or
protection against later sandbox changes.

Settings > Aiosell > Inventory sent / Aiosell read-back shows Mapped units, Sent and
Aiosell returned by category and date. If Sent is correct and Returned differs, it
does not identify whether propagation delay, Aiosell configuration or another writer
is responsible. Compare a later read or Aiosell's update logs before assigning cause.
Different single/double occupancy rate-plan rows are not different physical rooms.

To activate this diagnostic update, redeploy `aiosell-sync` and the frontend. No new
SQL migration or webhook deployment is required; existing migration 028+ stores the
additional result details. This is a diagnostic/validation update, not a confirmed
fix for a remote sandbox overwrite.

## Changing or removing mapped categories (migration 030)

Apply `202610220030_aiosell_pause_after_inventory_closure.sql` after 029. This is
a database-only fix; no frontend or Edge Function deployment is needed. It allows
safe pausing after Aiosell acknowledges zero inventory for the current revision,
even if rates fail or restrictions remain pending. It never marks those stages as
successful or bypasses inventory closure.

To replace/remove a saved room category:
1. Refresh Stayman to restore the saved mappings if an unsaved edit is blocked.
2. Keep their existing room codes, tick Stop sell on every mapping, and Save mappings.
3. Sync now. Inventory must be Sent, and confirm all those room types show zero
   availability in Aiosell. Rates/restrictions do not have to succeed for pausing.
4. Untick Enable background sync and receive bookings; Save connection while keeping
   those mappings in place.
5. Edit/remove mappings and Save mappings while paused.
6. Check new mapping codes, unit selections and prices, then clear the desired
   stop-sells, enable the connection, save, and sync.

Adding a new category without removing or renaming saved room codes does not require
pausing. The existing uniqueness and non-overlapping unit rules still apply.

## Follow Pricing (migration 029)

Apply `202610220029_aiosell_follow_pricing.sql` after 028, redeploy **aiosell-sync**,
then deploy the updated frontend. Existing room/rate-plan mappings, unit selections
and restriction targets are retained. Existing explicit channel prices are replaced
by Following Pricing; no local room prices or reservation totals are changed by the
migration. Check local Pricing values before allowing the scheduler to publish.

Set private rooms to INR 1,200 per room/night and mixed dorm beds to INR 600 per
bed/night in Pricing. Save once. Physical-unit rate writes already enqueue the
property transactionally; the worker now resolves each mapping's rate from those
units when claiming a snapshot. Aiosell Settings displays the followed price and
links back to Pricing rather than offering duplicate price entry.

Every mapped active unit must have the same positive rate. Different rates, missing
or archived units and unset/zero prices stop the rate stage with an explanation;
no minimum/average price is silently selected. Inventory and restrictions can still
publish independently. Split Aiosell room categories or align local prices to fix
conflicts. The channel API uses the same numeric price in its property currency;
no currency conversion is performed. Real INR rollout still requires aligned currency.

Pricing shows owner-only Pending / Sent / Failed (or Paused / Not configured).
Rate-stage results carry a property revision so old successful results cannot mark
new prices as sent. Rates may be Sent while restrictions remain Pending. Status
refreshes once/minute only while pending/failed and the page is visible and online,
with a manual refresh button. Automatic outbound delivery requires the scheduler;
otherwise use Settings > Aiosell > Sync now. Existing reservation charges are untouched.

Migration 029 wraps the earlier config-validation and inventory-claim functions.
Do not rerun older migrations 027/028 after 029: use migrations in numeric order.
Migration 029 itself is rerunnable.

## Partial sync fix (migration 028)

For an existing installation, apply `202610220028_aiosell_sync_results.sql` after
027, redeploy **aiosell-sync** and deploy the updated frontend. The webhook and
scheduler do not need redeployment for this fix. Save mappings once to clear an
old retry delay, then Sync now.

Inventory, rates and restrictions now have independent persisted results. When the
sandbox returns no inventory channel targets, inventory/rate requests still run;
the response is partial, with restrictions Pending. Full-success timestamps and
the synced revision advance only when ALL stages are sent. Incomplete jobs retain
retry/backoff rather than being marked fully synced. Actual API failures remain
Failed and expose the successful stages alongside them.

Settings > Aiosell includes optional Restriction channel IDs. Leave blank for
automatic discovery, or save comma-separated identifiers Aiosell explicitly
confirmed for that property. Null-operation or reservation-only partner records
are never guessed as inventory/restriction targets. Explicit saved targets avoid
the property-details lookup during sync (three outbound requests instead of four).

Outbound test prices are numeric amounts in Aiosell's configured property currency;
the UI labels a fetched ETB sandbox as ETB. Incoming bookings remain INR-only.

Implemented locally: owner-only Settings > Aiosell, room/physical-unit mapping,
inventory/rate/minimum-stay/stop-sell publishing, a durable authenticated reservation
webhook, automatic new-booking allocation, safe cancellation, manual exception review,
and a leased retry queue. No credentials are included in source control.

This has NOT been deployed or certified against Aiosell. Local SQL tests use synthetic
data. Production onboarding still requires Aiosell's assigned endpoints and partner ID.

## Deployment order

1. Apply migrations through 026, then `supabase/migrations/202610220027_aiosell_channel_manager.sql`
   using Supabase SQL Editor or your existing migration process. Migration 027 is rerunnable.
2. In Supabase Dashboard > Edge Functions > Secrets, add the names from
   `supabase/functions/.env.example`:
   - `AIOSELL_API_USERNAME`, `AIOSELL_API_PASSWORD`: supplied API Basic Auth.
   - `AIOSELL_API_BASE_URL`: `https://live.aiosell.com/api/v2/cm` for sandbox.
   - `AIOSELL_PARTNER_ID`: `sample-pms` for sandbox.
   - `AIOSELL_ALLOWED_ORIGINS`: comma-separated exact Stayman app origins; include
     the localhost origin only while developing. No trailing slash.
   - `AIOSELL_WEBHOOK_USERNAME`, `AIOSELL_WEBHOOK_PASSWORD`: separate inbound Basic
     Auth credentials; agree these privately with Aiosell before their webhook tests.
   - `AIOSELL_WORKER_SECRET`: independently generated random token of 32+ bytes.
   Supabase injects its backend URL/service-role secrets. Do not put service-role
   keys or any Aiosell secret in a `VITE_` variable or a property record.
3. Deploy both functions, retaining their in-function authentication:
   ```sh
   supabase functions deploy aiosell-sync --project-ref YOUR_PROJECT_REF --no-verify-jwt
   supabase functions deploy aiosell-webhook --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```
4. Deploy the frontend. As a property OWNER, open Settings > Aiosell. Save hotel code
   `sandbox-pms` with sync disabled, then fetch mapping. Confirm property timezone and
   INR currency. Map Aiosell room/rate-plan codes to the intended Stayman units.
   Units cannot appear in more than one mapping; bed/room types and gender policies
   cannot be mixed. Set explicit nightly channel prices, minimum stay and stop-sell.
5. Save mappings, enable sync, then use Sync now. Verify inventory, rates and
   restrictions in the Aiosell sandbox UI. Do not map live inventory into a shared
   sandbox without considering the real booking dates it would send.
6. Share this URL with Aiosell, along with the agreed inbound credentials through a
   private channel: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/aiosell-webhook`.
7. Enable Supabase Cron, pg_net and Vault. Add Vault secrets `stayman_project_url`
   (project base URL) and `stayman_aiosell_worker_secret` (same worker token), then run
   `supabase/aiosell-schedule.sql`. This is REQUIRED for background sync; without it,
   only Sync now drains jobs. The scheduler checks once/minute, invokes no function
   when nothing is pending, and can drain up to ten properties per tick.

See [Supabase secrets](https://supabase.com/docs/guides/functions/secrets) and
[scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

## Behavior and limits of this first version

- Sandbox endpoints follow the [Aiosell API docs](https://apidocs.aiosell.com/).
  The base URL and partner ID are configurable. The outbound host is restricted to
  `live.aiosell.com`; review the allowlist if Aiosell assigns another production host.
- A rolling 90-day window is republished after mutations and at least every 12 hours
  when the scheduler runs. A stay's checkout date is exclusive; each outbound day's
  start/end are inclusive. Confirm the desired production horizon and batch limits
  before enabling real channels; inventory outside this window is not managed here.
- One explicit rate plan per room type. Channel prices are separate from local
  room pricing. Seasonal prices, occupancy variants, multiple rate plans and dynamic
  pricing ownership need a subsequent design before production.
- Each `rooms[]` item is treated as one sellable unit. Confirm this for dorm beds
  with Aiosell. Entire-room and individual-bed shared inventory is unsupported.
  Mixed physical room/bed pools must not represent the same accommodation twice.
- Successful new bookings create one reservation with multiple allocations as
  needed. The booking total is split equally across allocations, with integer-paise
  remainder on the first allocation; this is not a room-level OTA invoice breakdown.
  `pah=false` is retained as a flag, not treated as money actually received.
- Contact fields may be absent. Only backend-imported guests can bypass the existing
  phone requirement with `ota_contact_withheld=true`. Gender-restricted inventory
  needs verified guest details and is routed to review instead of guessed.
- Credit-card data is discarded before database persistence. No card decryption,
  storage or charging is implemented. No raw webhook/request/credential logs.
- Identical webhook content is idempotent for a property/channel/booking. A cancellation
  tombstone prevents a delayed booking from resurrecting a cancelled reservation.
  Guest names do not serve as identity or duplicate keys.
- Modifications require manual review because the documented payload does not
  provide a modification sequence/version. Confirm latest state with Aiosell, update
  the linked local booking, and resolve the latest received review using its booking
  reference. This also closes earlier reviews for that same external booking. Issued invoices,
  paid/checked-in cancellations and allocation conflicts also remain review items.
- ANY unresolved review event temporarily publishes zero inventory and stop-sell
  for the mapped property. Review is ordered first in the bounded 30-event Settings
  list; resolving events reveals the next reviews. This conservative policy needs
  operational agreement and alerts before production.
- Stop sell every mapping and sync successfully before pausing a connection or
  changing hotel identity. Pause before removing a room type. Verify closure in the
  Aiosell UI; a successful API acknowledgement is not proof every OTA has updated.
- Current recovery covers outbound updates, durable inbound receipt and manual
  reconciliation. Automated Fetch Reservations backfill, event-retention jobs,
  external alerting and partner certification are still required production work.

## Performance and request counts

No Aiosell calls occur on dashboard loads or navigation. The Settings panel is a
separate lazy-loaded chunk. Allocation/inventory writes increment one property
revision in the same transaction; jobs recompute current availability, coalesce
changes and use a two-minute lease. Failures back off from 30 seconds to one hour.

One complete sync currently makes FOUR Aiosell requests: inventory, rates, property
details (connected channel codes), restrictions. Mapping fetch is one additional
request only when requested. With no mutations, the 12-hour refresh is approximately
8 outbound calls/property/day. With 100 separate sync cycles/day, approximately 400
calls, plus manual mapping fetches and failed-attempt retries. These are estimates,
not measured Aiosell billing. Outbound Aiosell requests, Supabase DB requests, Edge
Function invocations and incoming webhooks are different counters.

Database-only scheduler checks run 1,440 times/day at a one-minute schedule; idle
checks do not invoke Edge Functions. Browser/network disconnection does not stop a
deployed backend scheduler, but a paused/unavailable Supabase project does.

## Verification

Run `node --test tests/aiosell.test.mjs` and `npm run build`.
Local tests exercise actual migration SQL, safe reruns, ownership/service permissions,
missing guest data, duplicate delivery, reservation creation/cancellation, unmapped
rollback, review stop-sell, and sync revision/lease handling. They do not prove OTA
delivery or real Supabase Edge runtime deployment.

Before Aiosell signs off, test outbound values in their UI and inbound book/modify/
cancel, replay, withheld contact, multi-room, no-inventory, invalid authentication,
database outage, retry, and changes arriving during an in-flight sync. Use only
synthetic guest data. Switch credentials/endpoints only after onboarding approval.
