# Confirmed test-data cleanup

Reviewed 2026-10-24. These operations require an authorized database operator. This category does not authorize deleting real guests, issued financial history or external reservations.

### CLEAN-001 | How can I delete every local reference to bookings with test in the guest name?
<!-- faq: {"category":"data-cleanup","audience":["platform-admin","deployment-operator"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Delete every reference of a booking which has test in name","Test guests still show in lists","Delete test payment details too"],"related":[]} -->

**Answer:** Use the reviewed, property-scoped [test-booking cleanup script](../../scripts/admin/cleanup-test-bookings.sql) and its [instructions](../../scripts/admin/cleanup-test-bookings.md). Do not delete only the visible reservation or delete all people globally based on a display-name match.

**Starting state:** Explicitly confirmed disposable test data in the chosen property. The supplied script defaults to Hostarica's configured UUID/name and preview only. The substring rule is case-insensitive and matches names such as Testing/test 2, not only the exact name test. Names alone do not prove a record is disposable.

**Steps:** Run the whole script in preview mode. Review exact IDs/names/bookings, related-table counts, mixed/shared-group conflicts, issued test invoices and identity-file paths. Remove only reviewed files through Storage API/dashboard if present. Preserve an appropriate backup. Paste the reviewed preview token, enable execution and run the entire script. Explicit permission in the options is needed for disposable issued test invoices. A changed selection, unsafe group, active worker or remaining physical ID file stops deletion; any error rolls back the transaction.

**Verify:** Matching local database records are absent while unrelated guests, properties, inventory and accounts remain. Invoice sequences are not reset. With automatic sync enabled, verify released inventory delivery. External OTA cancellation/refund must follow the real provider workflow; database deletion does not perform either action.

**Limits:** The script covers current known database reference tables and identified invitation storage paths. It does not erase external provider records, backups, platform logs, unlinked arbitrary name text, staff/auth accounts or global usage counters. Unknown/new foreign-key dependencies should cause rollback, not trigger disabling constraints. Legacy folio payments are selected through folio links instead of assuming a reservation_id column exists.

**Evidence:** `scripts/admin/cleanup-test-bookings.sql`; `tests/cleanup-test-bookings.test.mjs` verifies preview/token checks, legacy folio-only payments, cross-property/unrelated-record preservation, mixed-group rejection, issued-invoice opt-in and physical-file guard.
