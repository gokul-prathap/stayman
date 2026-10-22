# Stayman performance and Supabase capacity audit

Date: 21 October 2026. Application changes: none. Only audit files were added.

**QA verdict: performance needs changes before approval for slow connections and older computers.** Small synthetic datasets work without JavaScript errors, but unnecessary full-history polling makes bandwidth and loading time grow with property age. A room count alone cannot determine capacity.

## Test scope and limits

- Built the production application using `npm run build`; build passes, with a large-chunk warning.
- Ran existing tests: 106 passed, 0 failed.
- Ran headless Microsoft Edge against the local Vite production preview. All Supabase HTTPS calls were intercepted and answered with synthetic data; no production data was read or modified.
- Fixture: 40 beds, either 100 or 5,000 records EACH in guests, reservations and allocations. Stays are historical; payments, booking-member documents and operations histories are empty. This understates a mature property's actual payload and processing load.
- Slow profile: 400 ms network latency, 400 kbit/s download, 200 kbit/s upload and 6x CPU slowdown. API responses use explicit latency and per-response byte delays; static assets use browser network throttling. Parallel mock responses do not accurately share a single bandwidth pipe. Results are comparative lab measurements, not production latency predictions.
- Local preview does not represent a production CDN's compression, caching, or Supabase database execution time. Browser routing disables browser HTTP caching. Dashboard readiness means the room status grid rendered, not a Lighthouse score or complete background refresh.
- Heap readings are JavaScript heap, not whole-browser RAM. CPU slowdown does not impose a 2/4 GB device memory limit. No physical low-end computer certification, long-duration leak test, OCR/HEIC runtime benchmark, production database load test, or authenticated live-Supabase usage measurement was performed.
- Raw measurements: [performance-results.json](performance-results.json). Reproducible harness: [performance-audit.py](performance-audit.py). Needs Python Playwright, Edge and a local production preview on port 4173. Environment values are read from `.env.local` without printing them.

## Measured behavior

| History per table | Profile | Dashboard ready | Initial API calls | Bell opened | Navigate to Stay View | Used JS heap at end | Longest main-thread task |
|---|---|---:|---:|---:|---:|---:|---:|
| 100 | Local, normal CPU | 1.02 s | 26 | 10 | 10 | 7.67 MiB | No task >=50 ms recorded |
| 100 | Slow network + 6x CPU | 11.88 s | 26 | 10 | 10 | 7.16 MiB | 347 ms |
| 5,000 | Local, normal CPU | 0.93 s | 56 | 25 | 25 | 17.82 MiB | 161 ms |
| 5,000 | Slow network + 6x CPU | 43.16 s | 41* | 26* | 14* | 16.57 MiB | 1,508 ms |

*For the larger slow scenario, requests remained in flight across observation windows. These counts are requests initiated during each window, including background work; they are not completed startup totals or the isolated request cost of that click. All four scenarios finished without JavaScript errors. The 1.5-second main-thread task is a significant responsiveness failure under this lab profile.

The 100-record normal profile made **20 API requests while completely idle for 62 seconds**. The large normal profile transferred 13.65 MB of uncompressed synthetic API JSON across startup, bell opening and one navigation. No JavaScript errors occurred in these completed scenarios. The small difference between the two normal startup times is noise and overlap, not evidence that larger histories are faster.

## Findings and proposed changes, in priority order

### P0: Notification polling reloads the whole property

`src/components/layout/WebCheckinNotifications.jsx:15` mounts in the staff top bar and calls `usePropertyData({refetchInterval:30000})` even when the panel is closed. `src/services/stayman.js:27` downloads six complete tables plus four RPC results for every refresh. This includes historical guests, allocations, reservations, payments, folio payments, team membership and member details.

**Change:** add a dedicated, small notification summary RPC returning count, pending IDs, minimal labels and an update version. Poll it once per visible property tab, initially every 60 seconds; pause on offline/hidden state and back off on errors. Fetch details when opened. Refresh relevant queries after a successful action. If 30-second freshness is operationally required, keep that interval on the small summary only. Do not just combine the same full history into one large RPC: that reduces request count but preserves bandwidth and memory problems. Realtime is an optional later choice and must be budgeted separately.

### P0: Historical data is unbounded

`allRows()` in `src/services/stayman.js:17` paginates until it has loaded every property record, using `select('*')`. `useOperations()` does the same for four operations tables. Dashboard summaries load operations transaction and event history even when only totals are needed. The guest directory is paginated, but the global notification component still loads history behind it.

**Change:** use bounded queries for active stays and the visible date range, page archive/detail lists on demand, select only required columns, and calculate dashboard/report totals in SQL. Include allocations overlapping the range with `check_in_date < range_end AND check_out_date > range_start`, plus explicit handling of relevant future arrivals. Validate composite indexes against real execution plans and RLS predicates; avoid adding indexes blindly. Keep historical financial correctness and archived-unit reporting covered by the existing tests.

### P1: Cache settings and component mounts cause redundant loads

`src/main.jsx:11` sets retry and focus behavior but no `staleTime`. Queries become stale immediately. The measured cold dashboard made two property snapshot loads: 26 calls with small history instead of the 16-call single-load baseline (property lookup + 10 snapshot calls + 5 operations calls). Bell opening adds a full invalidation; navigation adds another stale snapshot load.

**Change:** split queries by purpose and set freshness deliberately: property/config/team 5-15 minutes with invalidation on updates; active availability around 15-30 seconds with server validation on writes; notifications 30-60 seconds; historical pages several minutes. Avoid unconditional invalidation on panel opening when data is fresh. Thread TanStack's `signal` into PostgREST `.abortSignal(signal)` so abandoned requests can cancel. Retain database conflict checks for availability.

### P1: Reservation details has its own refresh loop

`src/features/reservations/components/ReservationDetails.jsx:22` invalidates the shared property query on mount and every 30 seconds. This timer is independent of notification/query-observer timers and does not check visibility or connectivity. Shared query keys deduplicate overlapping in-flight requests, so multiple observers do NOT automatically mean their request counts can be added. Offset timers and manual invalidation can still produce extra reloads or cancel/restart work.

**Change:** remove the manual full-property timer; use a reservation-scoped query governed by the central refresh policy. Invalidate only the affected reservation, availability, totals and notification summary after a mutation. Measure cancellation/retry behavior under loss before accepting.

### P1: Repeated array scans create avoidable CPU work

`loadPropertyData()` resolves each allocation with `.find()` over reservations and guests. This approaches O(allocations x (reservations + guests)). `reportMetrics()` repeatedly scans allocations/reservations/payments for every date; payment dates use `Intl.DateTimeFormat` inside those loops. Dashboard recalculates summaries on render. Current headless measurements do not prove a memory leak, but unbounded arrays and repeated processing increase CPU/GC work as history grows.

**Change:** use ID maps for joins, precompute payment local dates, group facts by day once, memoize derived results, and move long-range aggregation to SQL. For large inventories, window Stay View rows; keep keyboard navigation, booking actions and screen-reader behavior usable. Benchmark 100/200/500 units before choosing a virtualization threshold.

### P1: Initial bytes and document processing affect low-end devices

Build outputs include a 578.22 kB main JS chunk (167.72 kB gzip), 120.66 kB main CSS (25.25 kB gzip), 414.28 kB PhoneInput chunk (102.43 kB gzip) and a 1,352.84 kB HEIC converter (341.21 kB gzip). These are separate chunks, not all guaranteed to download on every route. Route lazy loading and dynamic HEIC/OCR imports are already good foundations. Dashboard imports reservation/modal code eagerly within its route; that can pull phone-entry dependencies before a booking is opened.

**Change:** lazy-load booking/detail dialogs at their actual entry points; inspect the production request waterfall before further splitting. Ensure hosting serves Brotli/gzip and immutable hashed-asset caching. Load flag assets only as needed. Preserve international phone validation rather than reducing metadata without regression checks.

Document processing accepts up to 64 million pixels; one decoded RGBA surface can be about 256 MB before canvas/decoder copies. That is a source-derived risk, not measured RAM consumption. OCR creates/terminates a worker per uncached image and may download engine/language assets; concurrent front/back work needs profiling. Photos have a 450 KiB target but a 1 MiB accepted maximum per side.

**Change:** serialize image/OCR work, constrain dimensions earlier where supported, release originals/canvas surfaces promptly, reuse at most one OCR worker with idle disposal, show download/progress status and retain reception review when screening is unavailable. Lower-memory decoding needs browser compatibility checks. Keep processing and sensitive document data on-device. Measure peak renderer + worker memory with actual JPEG/HEIC files, including overlapping uploads, before certifying this path.

### P2: Connection recovery and focus behavior

StaffGate requests property membership on every window focus, separately from TanStack's disabled focus refetch. Token refresh also reloads membership and temporarily gates the workspace. Default query retry is one: failure late in `Promise.all` can rerun the entire snapshot, repeating successful reads. Existing photo previews revoke object URLs and several write paths have idempotency request IDs, which are useful safeguards.

**Change:** throttle membership refresh; use a shared cached membership query with explicit permission refresh. Keep last-loaded read data visible with a clear stale/offline indicator. Retry transient reads with backoff; avoid retrying permission/validation errors. Preserve server-enforced write validation and stable idempotency keys. Do not automatically queue bookings/payments offline without conflict and duplicate protection. Do not persist guest identity documents as an offline-cache shortcut.

## API calls per day

Count Supabase REST/RPC/Auth/Storage requests separately from static hosting requests, CORS preflights and individual SQL statements. One HTTP RPC can execute many database queries.

For one full property refresh, assuming the configured server page cap is at least 1,000:

`C = 4 + sum(floor(table_row_count / 1000) + 1)`

Sum across units, guests, reservations, allocations, payments and folio payments. An exact multiple of 1,000 causes one extra empty page request. A server page cap below 1,000 would invalidate this loader's completeness assumption and needs a separate correctness test.

For properties P, active browser tabs per property T and visible hours H:

`polling requests/day ≈ P x T x H x 120 x C`

This is the foreground 30-second polling estimate; startup, authentication, focus, navigation, writes, details, retries and guest activity are extra. Query-observer polling normally pauses in hidden tabs; the independent reservation detail interval requires fixing. Background browser timer throttling also changes observed counts.

| Scenario | C | Polling requests/day | Polling requests/30 days |
|---|---:|---:|---:|
| 1 property, 1 tab, 8 h, small history | 10 | 9,600 | 288,000 |
| 1 property, 2 tabs, 8 h, small history | 10 | 19,200 | 576,000 |
| 10 properties, 2 tabs each, 8 h, small history | 10 | 192,000 | 5,760,000 |
| 1 property, 1 tab, 24 h, small history | 10 | 28,800 | 864,000 |
| 1 property, 1 tab, 8 h, synthetic 5,000-row history | 25 | 24,000 | 720,000 |

A mutation followed by snapshot invalidation costs approximately `1 + C` calls before other invalidated queries. New booking may also do an availability recheck. New guest check-in generally adds property branding RPC + invitation/public-start RPC + anonymous signup if no session + one Storage upload per required side + completion RPC (typically 6-7 requests with two sides), plus viewing/retry/session overhead. OCR asset downloads are external static traffic, not Supabase API calls.

## Will Supabase Free support this?

Supabase's current [pricing](https://supabase.com/pricing) includes unlimited API requests, 500 MB database storage per project, shared CPU/500 MB RAM, 1 GB file storage, 50,000 monthly active users, 5 GB egress and a separate 5 GB cached egress allowance. [Database responses count as egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress). Cached Storage bandwidth is not an extra allowance for database API responses. Quotas and compute are shared by the relevant project/organization, not renewed for each property row.

**Request count alone does not reject Free; current repeated payloads can exhaust bandwidth even with relatively few properties.** No reliable property limit can be claimed without actual response bytes, active tabs, history, document retention and database execution measurements.

For one tab open 8 h/day there are 960 polling snapshots/day. Let B be actual billed outbound bytes across one COMPLETE refresh, not bytes per individual API request:

`monthly polling egress = P x T x 960 x 30 x B`

| Total bytes per refresh | Monthly egress, 1 property / 1 tab / 8 h |
|---|---:|
| 50 kB | 1.44 GB |
| 100 kB | 2.88 GB |
| 500 kB | 14.4 GB |
| 1 MB | 28.8 GB |

At that schedule, one tab has a theoretical full 5 GB budget of about **174 kB per refresh**, leaving nothing for other activity. Ten properties with two tabs each reduce it to about **8.7 kB per refresh**. Use a lower operating budget with headroom and validate against Supabase Usage; uncompressed mock JSON is not the billing meter.

The fixtures produce about 73.7 kB (small) and 3.41 MB (large) of JSON per snapshot before transport compression. Those correspond to about 2.12 GB and 98.3 GB/month of uncompressed response data for one 8-hour tab. These are illustrative byte projections, not measured Supabase charges.

Identity storage can become the first limit: two photos at the 450 KiB target use about 0.92 MB per guest. 20 new guests/day retain about 553 MB/month; 50/day about 1.38 GB/month, before deletion or other files. At the accepted 1 MiB-per-side maximum, 20/day use about 1.26 GB/month. Retention and deletion policies must be designed explicitly; target compression is not a guaranteed bound.

Recommendation: use Free for a controlled pilot after the P0/P1 fixes, with usage monitoring and a measured budget. Do not certify the present implementation for multiple busy properties on Free. For production growth, evaluate Pro (currently from $25/month) after fixing waste; upgrading does not solve poor client loading patterns.

## Acceptance criteria for the next implementation

1. One closed notification panel uses at most one small summary read per 60 seconds; no full-history requests. Hidden/offline clients do not poll, including reservation detail timers.
2. Opening a fresh bell or navigating between cached views causes no unnecessary full reload. Writes update affected views and server conflict checks still reject overlapping stays.
3. At 5,000+ historical bookings, dashboard network bytes and active-view memory remain bounded by visible data, rather than history size. Add substantial payments, members and operations data to the next fixture.
4. Under the same slow profile, target a usable cold dashboard within 5 seconds with production asset compression, no routine interaction task above 200 ms, and a consistent cached navigation experience. These are proposed targets, not achieved results.
5. Test actual 4 GB RAM / dual-core hardware: renderer/worker peak RAM, repeated navigation and modal open/close for at least 30 minutes, 200+ units, OCR/HEIC, uploads interrupted mid-transfer, offline/reconnect and server timeout after committed writes. Heap growth should plateau after collection; record whole-process memory too.
6. Verify production database plans under representative concurrent properties, plus actual daily API bytes, storage growth, p95 latency and errors. Set alerts at 50/75/90% of the chosen operating budget.

Implement P0 query separation and bounded data first, then cache/CPU/dialog improvements, then repeat the same lab scenarios and the physical-device tests. No application changes have been made during this audit.
