# Aiosell operating instructions

Reviewed 2026-10-24 against local source through 048. Confirm production version separately. Use the selected property's actual identifiers, capacities and prices. No step below authorizes a chatbot to mutate live data.

## AIO-RUN-001: Connect a new property

Audience: platform admin, then owner. Related: AIO-001–004, AIO-008, AIO-015–018.

1. In Admin → Properties, open the intended property and its Aiosell tab. Check the property identity in the header.
2. Enter the hotel ID supplied by Aiosell; select Connect & fetch units. A failed lookup must leave the active association unchanged.
3. Verify returned identity/currency/timezone/categories. Save verified association. Owner setup remains incomplete until mappings/prices/guest rules pass.
4. Match real units, deliberately exclude others and inspect selected rate plans. Compatible grouped units have one category mapping and one aggregate inventory quantity.
5. For private rooms, enter actual included guests, maximum guests and extra charge. Use fetched plan occupancy. Fewer guests can pay the base allowance after 048; never infer occupancy from suffixes.
6. Confirm and Review setup → Save & restart updates. For an initial empty configuration this prepares review. Existing mappings follow RUN-002 instead.
7. Verify supported inventory restriction targets separately from provisioning the actual OTA in Aiosell. Do not guess a target or assume reservation-operation targets support sales control.
8. Owner → Settings → Aiosell: review saved rooms/prices and Start selling online when ready. Set Automatic updates according to intended operation.
9. Complete RUN-006 checks. A successful association save does not establish online bookability.

## AIO-RUN-002: Change or remove existing mappings safely

Audience: platform admin. Related: AIO-005, AIO-019–027.

| Stage | Action | Checkpoint / recovery |
| --- | --- | --- |
| Inspect | Identify old and proposed categories, linked bookings and intended closures | Hotel replacement with linked bookings is blocked. Do not detach production reservations. |
| Review | Fetch verified target; review unit matches, prices, plan counts and capacities | Correct invalid inputs before requesting a closure where possible. |
| Start | Save & restart updates; read/confirm the stated closure scope | Proposed matches are saved for retry; old association stays in place. |
| Close | Current code closes all old mapped categories in the rolling 90-day scope | Retry only a failed/unaccepted closure, not an already accepted closure. |
| Verify | Refresh status; inspect the exact closure revision and zero availability in Aiosell | Do not tick the checkbox just to unlock a button. |
| Apply | Tick verified closure; click Finish save & restart updates | Final validation can still fail. Saved proposal, not new unsaved edits, is applied. |
| Restart | Check accepted reopening/rates or required owner review | Intentional closures are retained. A saved proposal being applied does not prove OTA reopening. |

If the persisted proposal contains wrong guest limits, inspect it and then Discard proposed change. Discard leaves inventory closed. Refetch, rebuild corrected matches, review and save; do not assume discarding reopens anything. If final apply succeeds but delivery fails, retain the new mapping and repair/retry delivery rather than resetting again.

## AIO-RUN-003: Resolve private-room guest validation

Audience: platform admin. Related: AIO-015–019, AIO-022.

1. Capture the exact error and which action failed: preparing, closure or final apply.
2. Inspect both private-room rules and selected plan guest counts in the saved proposal/current configuration. Compare fetched max occupancy and plan occupancies.
3. If remote max is 2, local max 3 cannot be saved. Extra-adult 500 is a charge field, not additional capacity.
4. For an actual two-guest flat-price room after 048: included 2, maximum 2; one-guest plan count 1 and two-guest plan count 2, only when those are the verified remote values. Extra charge is unused at max 2.
5. For three guests: obtain remote capacity and appropriate occupancy-plan support first, refetch, then configure included 2/max 3/actual extra charge and required guest-count plan coverage.
6. If an old proposal is pending, discard/rebuild it as RUN-002 explains. For a repeated failure, stop repeating saves and inspect exact persisted values.

Success: the final saved configuration passes readiness, resolved occupancy prices are correct and no additional physical room is created by adding occupancy plans.

## AIO-RUN-004: Recover a saved price that was not delivered

Audience: owner, support. Related: AIO-011–014, AIO-025–027.

1. Confirm the intended amount is saved in Stayman Pricing and that existing reservation totals remain as expected.
2. Confirm active/approved setup and Automatic updates. Enable it only if automatic delivery is wanted; do not reopen intentional room/site closures.
3. Inspect stage results. A manual sales-only job can skip rates when automatic updates are off. Local save, queue, Aiosell acceptance and OTA completion are separate.
4. Retry the actual failed pending update. If the worker reports no eligible job, refresh state and inspect revision/lease/retry eligibility. The message does not prove a worker is active or guarantee a forced republish.
5. If external mapping changed with no new local work, request a supported Aiosell resend rather than editing prices or remapping purely to create work.

Success: rates accepted for the intended revision and representative date; compare actual Aiosell and OTA Standard Rate next.

## AIO-RUN-005: Diagnose blank or wrong Booking.com prices

Audience: owner/admin, then Aiosell support. Related: AIO-028–033, AIO-040.

1. Select one future date inside Stayman's displayed scope and the same guest count across systems.
2. In Stayman, record the unit's standard price, actual available allocations, room/site desired permission and latest accepted results.
3. In Aiosell, inspect that category's rate plans, amount, available quantity and date restrictions.
4. In Booking.com Extranet calendar, inspect room status, rooms to sell, Standard Rate, occupancy, minimum stay and arrival/departure restrictions. “Price missing,” “Closed” and “Multiple blockers” need distinct checks. Open the Review/Possible issues panel when available.
5. Trace Aiosell → Booking.com property, room and rate-plan IDs. Provider confirmation is required for occupancy encoding and many-to-one bed aggregation. Do not automatically call shared plan IDs wrong.
6. If Aiosell has correct data but Extranet does not, ask Aiosell to inspect the actual downstream response and resend corrected data. Preserve Stayman's correct mappings/prices.

Support message template:

> Property <name>, Aiosell hotel <ID>, Booking.com property <ID>, room <ID>, rate <ID>, date <date>, guests <count>. Stayman expects <price/available count/permission>. Aiosell shows <values>. Booking.com Extranet shows <blank/wrong/closed/blocker>. We changed <specific mapping> at <time/timezone>. Please verify room and rate-plan mapping, pricing model, aggregation where applicable, and latest delivery response. Resend rates/inventory/opening restrictions as appropriate and confirm Booking.com acceptance. No credentials are included.

## AIO-RUN-006: Verify end-to-end operation

Audience: authorized owner/admin/support. Related: AIO-024, AIO-029, AIO-036, AIO-041.

Use this evidence record; never fill unobserved cells with assumed success:

| Item | Stayman saved/expected | Latest Aiosell accepted result | Actual Aiosell date | Booking.com Extranet date |
| --- | --- | --- | --- | --- |
| Hotel/category association | Actual property and category | Mapping/configuration evidence | Actual identity | Actual mapped OTA IDs |
| Base/occupancy price | Amount for guest count | Rates stage/revision | Amount | Standard Rate amount |
| Available quantity | Free, unblocked unit count | Inventory stage/revision | Quantity | Rooms to sell |
| Sales permission | Intended room + site + date rules | Relevant scope acknowledgement | Open/closed | Bookable or exact blocker |

After mapping/aggregation has been confirmed, use an explicitly authorized controlled direct pending reservation on a free unit to check a one-unit decrease on occupied nights. Check its release/cancellation restores only relevant nights, preserving history and correct payments. Do not create a fake paid OTA booking, erase existing bookings or assume checked-in bookings can be cancelled like pending bookings. A pooled category decreases by one bed; a private-room category decreases by one room, independent of guest-count plans. If current behavior contradicts this, stop and inspect allocations/outgoing quantities before more tests.

## AIO-RUN-007: Collect safe evidence for support

Audience: authorized support/deployment operator. Related: AIO-019, AIO-025, AIO-032, AIO-034, AIO-037–039.

Use [diagnostics.sql](diagnostics.sql) one query at a time, replacing the property UUID deliberately. It is read-only. Prefer authenticated scoped product diagnostics if/when available. Capture current association, deployment version, pending proposal, remote occupancy and per-stage status, not screenshots of passwords or service keys. A mutation request body can help diagnose stale proposals, but redact guest contacts and secrets. Do not execute arbitrary SQL suggested by a chatbot against production.
