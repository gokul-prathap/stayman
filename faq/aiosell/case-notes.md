# Aiosell setup incident: observed facts and lessons

Case date: 2026-10-24 conversation. These are historical observations, not a fresh query of the deployed system. No credentials or guest names are retained here.

## Property-specific reference only

- Property: Hostarica (the user also typed spelling variants).
- Old sandbox association: `sandbox-pms`.
- New Aiosell hotel: `1b8ae0cf67`.
- Actual supplied categories: `mdr-bed-1` through `mdr-bed-4`, `mdra-bed-1` through `mdra-bed-4`, `private-room`, `private-room-2`.
- Supplied private-room rules from Aiosell: maximum occupancy 2; `s-ep` occupancy 1, `d-ep` occupancy 2; `extra_adult` 500. Do not generalize suffix meanings.
- Desired standard prices: MDR ₹500 per bed; MDRA ₹550 per bed; Room 101 ₹2,000; Room 201 ₹2,500. One and two guests use the same private-room base amount.
- Supplied OTA mapping: `private-room` → Booking.com room `1734983203`; `private-room-2` → `1734983204`. Four MDRA categories mapped to room type `1734983206`. This mapping's aggregation was not verified.

## Sequence, evidence and corrected understanding

| Observation | Confirmed meaning | Recovery / unresolved point |
| --- | --- | --- |
| Hotel replacement blocked after “no real bookings” | Two old integration booking links existed; the user confirmed both were sandbox tests | A scoped operator cleanup was discussed; this does not justify production detachment. |
| Old `executive` category had different prices, restriction request 403 and inventory rejection | Saved connection was still enabled on `sandbox-pms` | Do not change legitimate new-property prices to satisfy obsolete sandbox categories. Provider authorization for old/new targets is separate. |
| An old unmatched test booking remained after link cleanup | A review event persisted independently | Do not create a new real reservation to dismiss it. |
| Owner showed setup incomplete | Private-room guest rules were null; saved prices had no conflict and automatic updates were false | Fix actual readiness inputs instead of repeated sync. |
| User entered maximum 3 with extra ₹500 | Fetched Aiosell maximum was 2; available plans were occupancy 1/2 | Extra-adult amount does not create extra capacity. Ask provider before raising max. |
| User wanted one/two guests to pay standard room price | Old validation treated included count as minimum plan count | Migration 048 permits lower occupancy with the same base price; extra-guest arithmetic already used a nonnegative difference. |
| Changing visible max did not eliminate final apply error | Finish applies a stored transition proposal; another private mapping could also fail | Inspect persisted target. Discard/rebuild wrong proposal; discard leaves inventory closed. Exact cause of each repeated failure was not independently read from its stored proposal. |
| Closure accepted / all HTTP responses 200 | Closure and successful transport are not final mapping apply or OTA reopening | Explicit Finish save & restart updates still needed. |
| “No pending inventory sync” after retry | No eligible job was claimed; active worker was only one possible explanation | Check current revision, accepted stages and transition rather than repeated retries. |
| Owner screenshot showed room Update failed, site enabled | Independent scope states; screenshot did not establish live OTA selling | Later SQL showed all ten desired open/acknowledged open, no error/transition/manual pending, auto_sync false. Do not keep diagnosing from stale screenshot. |
| User turned automatic updates on | The user reported enabling it | This alone did not establish downstream Booking.com delivery. |
| User said Aiosell OTA mapping was wrong and corrected it | Self-reported mapping correction | Requires downstream room/rate-plan verification and resend; no final delivery proof supplied. |
| Extranet later showed Double Room missing prices/closed and Deluxe ₹2,000 | Booking.com was still not consistent with intended ₹2,000/₹2,500 Standard Rates | Exact remaining mapping/delivery/restriction cause unresolved; request provider response and Review/Possible issues panel. |
| Booking.com warned only 89 more days available | Consistent with current rolling 90-day scope | Does not explain missing prices inside the window and does not certify all dates were delivered. |

## Do not learn these incorrect shortcuts

- “All green” means the property is definitely bookable.
- A green Booking.com switch proves all rooms have current prices.
- HTTP 200 means every requested stage succeeded.
- Extra-adult 500 permits a third guest despite max occupancy 2.
- S/D suffixes universally mean 1/2 or can be relabelled as 2/3.
- One Aiosell category per physical bed automatically guarantees correct downstream pooled inventory.
- A duplicate OTA rate ID is necessarily wrong regardless of pricing model.
- A test-looking name authorizes deleting all matching production guests or bookings.
- Correcting a visible field edits an already saved transition proposal.
- The last screenshot proves a provider issue is fixed without an actual downstream check.

## Current outcome to preserve in future support

Stayman configuration and Aiosell acceptance were observed as successful at one stage. The final supplied Booking.com screenshot still had blank Double Room rates and the wrong Deluxe Standard Rate. Do not label this incident end-to-end resolved. Obtain fresh evidence; rates, mappings, reservations and dates can change after the conversation.
