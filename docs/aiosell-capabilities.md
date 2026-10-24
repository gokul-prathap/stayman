# Aiosell capability boundaries

Checked against public Aiosell documentation on 24 October 2026. Development used local SQL fixtures and mocked HTTP/browser responses, not production integration calls.

| Capability | Evidence / implementation |
| --- | --- |
| Property, categories and rate plans | Documented GET `/property_details/{hotelCode}?partnerId={pms}`. Administrator-only preview fetches and stores a limited verified snapshot. |
| Connected channels | Property-details example includes `connected_channels` with operation, partner_id and hotel_code. This is not a verified OTA setup/health status feed. Inventory-operation rows can be reviewed by an administrator; null/reservation-only entries are never guessed as restriction targets. |
| Prices and absolute availability | Documented PMS rate/inventory push endpoints. Multiple rate-plan prices share one inventory category. |
| Room and individual-channel stop-sell | Documented inventory restrictions request includes `toChannels`, date range, roomCode and restrictions.stopSell. Enabled only for administrator-verified returned inventory targets. One request per configured channel combines all relevant restrictions, with independent acceptance tracking. |
| Acknowledgements | Documented success response acknowledges Aiosell acceptance. It does not document downstream OTA confirmation. Owner manual sync may sample Aiosell inventory read-back, which still is not an OTA acknowledgement. |
| Reservation delivery | Documented book/modify/cancel POST webhook with Basic Auth. Stayman stores normalized payloads before acknowledgement and deduplicates by identifiers/fingerprint. Modifications remain reviewed because reliable event ordering/version semantics are not documented. |
| Occupancy | Returned rate-plan occupancy may be used for validation; plan suffixes are not inferred. Included/max guests and extra-guest rules are explicit administrator settings. Publishing a 3-guest price needs an appropriate configured plan. |
| Creating hotels/room categories, changing contacts, OTA connection setup | No verified public PMS endpoint identified. The admin page cannot create these remotely; ask Aiosell to prepare them. |
| Scope | Rolling 90-day horizon. No claim of all future dates or channel-level future-period maintenance while automatic updates are off. |

## Sources

- https://apidocs.aiosell.com/api/property-details
- https://apidocs.aiosell.com/api/inventory-restrictions-push
- https://apidocs.aiosell.com/
- https://support.aiosell.com/portal/en/kb/articles/aiosell-rest-api-documentation-property-management-system-to-channel-manager
- https://support.aiosell.com/portal/en/kb/articles/reservationpost

## Preview and verification

Run the app locally and open `/preview/aiosell`. Desktop/mobile, light/dark, setup states and simulated delivery outcomes are outside the product UI. Preview OTA names/prices are illustrative. Real owner Settings uses an RPC/Edge adapter; the preview adapter has no network operations.

Verification: `node --test tests/*.test.mjs`; actual PostgreSQL/PLpgSQL via PGlite in `tests/aiosell-owner.test.mjs`; mocked browser checks `qa/aiosell-owner-smoke.py` and `qa/aiosell-admin-smoke.py` with Playwright/Edge. No test sends credentials or writes to production.

Administrator workspace preview: `/preview/admin` uses the same configuration component with a synthetic adapter. Candidate property lookups are stored separately from the saved association; fetching another hotel does not change the active owner property or readiness. Migration 047 and `tests/admin-workspace.test.mjs` cover admin isolation, last-owner protection, shared-category availability, durable closure/restart failures and historical invoice preservation. The guided change closes all old mapped categories to satisfy the existing full-closure pause guard; acceptance still requires an administrator check in Aiosell.
