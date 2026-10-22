# Stayman deployment instructions

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
