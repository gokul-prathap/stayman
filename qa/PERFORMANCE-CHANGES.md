# Performance changes and verification

21 October 2026. Implemented in the local workspace; not deployed to the connected Supabase project.

## Deployment order

Apply [migration 026](../supabase/migrations/202610210026_bounded_workspace_queries.sql) after 025, then deploy the matching frontend. The migration adds staff-authorized read functions and indexes; it does not change existing records or mutation RPCs. No privileged Supabase connection was available in this workspace, so the migration was tested locally rather than applied remotely. The client requires these functions; do not deploy it first.

## What changed

- The staff layout remains mounted during route imports. Only the content pane shows its loading indicator. Public standalone pages and initial session startup retain their full-page loaders. Same-user token changes no longer rerun the initial membership gate. Focus membership checks are throttled to five minutes.
- A dedicated notification RPC runs once per minute while visible and online. Dashboard and bell share its query/cache. Opening the bell does not reload the property. The notification response contains minimal labels/review flags, exact counts and up to 100 entries per group, with links to the complete guest list.
- A small revision fingerprint lets notifications invalidate visible workspace/operations data when other staff change relevant records. Unchanged polling does not reload history. Already-running reads are not cancelled/restarted by that watcher.
- Dashboard data covers the displayed 30 days. Expense totals, all-date pending refunds and recent activity are calculated in SQL; the browser does not download all ledgers to calculate them. Current stock balances are returned without the movement/event histories.
- Stay View and reports request date windows. Reports include the comparison period. Refund management explicitly loads pending refunds across all dates and relevant returned refunds, retaining the existing financial meaning. Historical reservation details load their own history, rather than the property history.
- Reservation and expense lists page on the server (25 rows). Reservation searches run after a 300 ms debounce. Stock views fetch only current balances and the latest 50 movements; expense totals are computed over the full selected scope, independently of the displayed page.
- Booking, extension and maintenance dialogs request availability for their selected dates. Existing transaction RPCs still enforce availability and concurrent-write rules. Cached display availability never authorizes a write by itself.
- Queries have explicit freshness/shorter cache retention and pass abort signals to Supabase. Mutation refreshes invalidate related property and guest caches. Cached workspace data remains visible when a background refresh fails.
- Allocation joins use ID maps. Report calculations reuse date formatters and group payment dates once. Dashboard report calculations are memoized.
- Booking/edit dialogs and phone-input dependencies load when opened. Collapsed invoice preparation does not fetch its folio until expanded.
- Decorative SVG animation pauses when hidden or off-screen, retaining the existing reduced-motion behavior. OCR tasks queue so only one recognition engine allocates memory at a time. OCR assets and HEIC conversion remain loaded on demand.

## Measured comparison

Same browser, production preview, 40 units and either 100 or 5,000 historical rows EACH in guests/reservations/allocations. Slow profile: 400 ms latency, 400 kbit/s download, 200 kbit/s upload, 6x CPU slowdown. All Supabase traffic was intercepted; the revised responses came from the actual new SQL functions running against synthetic data in local PGlite. No production data was read or written.

| Measurement | Before | After |
|---|---:|---:|
| Small-history startup API requests | 26 | **3** |
| Larger-history startup API requests | 56 | **3** |
| Idle requests over 62 seconds, small history | 20 | **1** |
| Open a fresh notification bell | 10–25 | **0** |
| First navigation to Stay View | 10–25 | **1** |
| Return to a fresh cached dashboard | Full snapshot on mount | **0** |
| Small history, normal dashboard readiness | 1.02 s | **0.95 s** |
| Small history, slow dashboard readiness | 11.88 s | **8.81 s** |
| Larger history, normal dashboard readiness | 0.93 s | **0.95 s** |
| Larger history, slow dashboard readiness | 43.16 s | **8.51 s** |
| Larger history, used JS heap at measurement point | 17.82 MiB normal / 16.57 MiB slow | **9.41 MiB normal / 8.06 MiB slow** |
| Larger history, longest slow main-thread task | 1,508 ms | **427 ms** |

The normal startup differences around one second are noise. The main improvement is that old history no longer increases the dashboard transfer: startup API JSON was approximately **10 kB for both history sizes**. The phone-input chunk was not requested during dashboard loading. A cached dashboard can legitimately make one request after the one-minute freshness period; the 62-second idle test deliberately crossed that boundary.

The local preview serves uncompressed assets. This is not a production CDN benchmark. Mock API responses use per-response byte delays, so parallel responses do not perfectly share one constrained network pipe. Before/after sequences also differ slightly: the revised run additionally returns to the dashboard and navigates offline. Heap is JS heap, not whole-browser/worker RAM. Values are single lab observations, not p95 or device guarantees.

Raw measurements: [before](performance-results.json), [after](performance-after-results.json). Original findings: [audit](PERFORMANCE-AUDIT.md).

## Daily request estimate after the change

Foreground, unchanged data, 8 hours/day; startup, writes, searches, uploads, errors/retries, revision-triggered refreshes and page navigation are extra:

| Scenario | Before polling/day | After polling/day |
|---|---:|---:|
| Dashboard, 1 property / 1 tab / small history | 9,600 | **480** |
| Dashboard, 1 property / 1 tab / 5,000-row histories | 24,000 | **480** |
| Dashboard, 10 properties / 2 tabs each / small histories | 192,000 | **9,600** |
| Stay View, 1 property / 1 tab / small history | At least 9,600 | **960** (notifications + visible date window) |
| Stay View with reservation details open | Additional full-property timer | **1,440** (three scoped minute queries) |

Hidden/offline polling stops. An active dashboard that changes because other staff work will make extra scoped refreshes; do not budget it as permanently idle. Storage retention, image downloads and Supabase database capacity still need usage monitoring.

## Verification and remaining limits

- Production build passes. The main bundle still triggers Vite's size warning; it is about 577 kB raw / 167 kB gzip. The large phone/HEIC chunks remain separate and load on demand.
- **108 tests pass**, including executing the actual migration in local PGlite. New tests cover pagination, bounded history, date-scoped availability, archived payment dates, all-date pending refunds, complete expense totals despite pagination, notification count/capping/privacy, SQL grants and denied access.
- Browser checks found no JavaScript errors, no dashboard/full-screen flash during tested navigation, and preserved navigation DOM. A cold `/stayview` reload did not render Dashboard.
- Interaction checks cover reservation search/pagination, historical details, delayed billing fetch, extension and booking date scopes, expense and refund views, cached offline navigation and stopping polling while hidden/offline. See [smoke results](workspace-smoke-results.json).
- The proposed under-five-second slow cold-load target is **not yet met in uncompressed preview**. Slow main-thread tasks also remain above the proposed 200 ms target. Verify production compression/caching and profile parsing/rendering on actual target hardware before certifying those targets.
- No physical 2–4 GB computer test, long-duration whole-process memory test, real OCR/HEIC peak-memory benchmark, production SQL load/concurrency test, or live Supabase billing measurement was performed. Image processing can still have substantial peak memory; serialization reduces concurrent engines but is not a RAM guarantee.

Reproduce with `npm run build`, `npm run preview -- --host 127.0.0.1 --port 4173`, and `node qa/workspace-server.mjs`. With Python Playwright and Edge installed, run `qa/performance-after.py` and `qa/workspace-smoke.py` one at a time; both reset the same synthetic database. This environment installed Playwright under `qa/.python` (ignored by Git), so its PowerShell runs use `$env:PYTHONPATH='qa/.python'`.
