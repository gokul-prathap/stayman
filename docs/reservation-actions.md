# Reservation actions setup

Run the entire `supabase/migrations/202610100008_reservation_actions.sql` once in Supabase SQL Editor after 006 and 007. Keep existing data; do not rerun old migrations or seed data.

- Today's new walk-ins default to CHECKED_IN. Advance bookings default to PENDING (awaiting arrival). Staff can explicitly reserve without checking in. Details includes Check in guest during the booked dates.
- Rooms & Beds now reads actual stayman_units instead of mock rooms. New reservation and move controls show configured units, including disabled occupied/incompatible options. If no units exist for the selected property, add them to stayman_units; the UI explains this.
- Cancel reservation requires a 3–250 character reason and confirmation. All allocation rows are archived on the reservation and released. Guest, charge and payment history remain. No cancellation fee/refund policy is assumed: recorded charges remain historical and staff can record actual refunds separately.
- Move bed / room supports private rooms and dorm beds in both directions. It defaults to one night. Select all nights from this date explicitly to move the rest of a stay. Drag/drop in the matrix still moves only the dropped night.
- The confirmation shows old/new totals, net paid, balance due or refund due. Target nights use the saved target rate; other nights retain their charge. A zero nightly rate means a free stay, so set Pricing first.
- Collected money is never silently reduced after a downgrade. If paid exceeds the new total, Record refund records money actually returned. Payment and refund request IDs prevent duplicate retries.
- Reservation locks serialize moves, payments and cancellations; the exclusion constraint prevents concurrent bed overlaps. Quotes are rejected if totals or target rates changed before confirmation.
- Allocation charge snapshots preserve total paise when splitting nights. Older custom booking totals are distributed across existing segments exactly. Reports use allocation charges after this migration and subtract dated refunds from receipts.

Test: create a walk-in, reserve a future stay, check in a pending guest, cancel with a reason and verify bed release, move a paid private-room booking to a cheaper dorm and confirm refund due, record the refund, refresh and inspect payment history. Also try an occupied target and a simultaneous/stale price quote.

The migration has not been applied to hosted Supabase automatically.
