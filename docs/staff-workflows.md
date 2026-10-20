# Staff workflow updates

Run `supabase/migrations/202610110013_staff_workflows.sql` once in Supabase SQL Editor **after migration 012**. If 012 has not been applied, run it first. Deploy the updated app afterward. No live database changes were made automatically.

## How staff use the changes

- Stay View: click a dashed Maintenance cell, choose Confirm release. This releases the entire selected maintenance block; its previous details remain in the staff audit log.
- Reservation drawer: the web check-in summary appears near the top. View submitted guest details & IDs opens submissions. Each ID image still requires its own Click to load ID action. The open reservation refreshes every 30 seconds.
- Extend stay: select the new departure and an available bed for added nights. Confirm the additional charge. Original allocations, their charges and payment history remain unchanged. The server rejects overlapping allocations and stale quotes.
- Guests: defaults to current stays. Filter current/future/past/awaiting allocation, web check-in status, and name/phone/email/booking reference. Pagination (10, 25 or 50 rows) and counts run in Supabase. Expand a row for the summary; View fetches contact/submission details. Edit name updates the staff display name, preserving original submitted identity details.
- Global search: type at least two characters in the top bar. Choose a guest/booking result, then View reservation inside the guest profile when needed.
- Expenses: the round receipt button expands Add expense. Edit opens the same form, including a required correction reason. Staff can edit active expenses; owners can void them. Corrections update dashboard expense totals.

## Identity matching

A submission must be explicitly linked to its booking or guest. Group web check-in can link an unallocated walk-in; choose This submission belongs to the booking contact when appropriate. The app does not match people by name alone. Unallocated reception submissions remain under Guests > Awaiting allocation.

## Access and validation

All new RPCs require staff membership in the relevant property. Anonymous guests cannot read the directory, profiles or audit log, release maintenance, edit expenses or extend reservations. Table writes remain restricted to authorized server functions. Expenses use an expected snapshot to reject concurrent edits; stay extensions check the old departure, total and current rate. Maintenance release, name corrections, extensions and expense corrections are audited in stayman_staff_actions.

Guest list initial requests contain summaries only, without submitted identity JSON or image URLs. View requests a scoped profile. ID image URLs are short-lived and requested separately on click. Other existing pages still use the property data hook; the server pagination in this release applies to the Guests directory.
