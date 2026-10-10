# Reports, settings, pricing and payments

## Supabase setup

Run the entire `supabase/migrations/202610100007_management.sql` file once in Supabase SQL Editor, after migration 006. This is additive: existing reservations and staff access remain intact.

Existing staff memberships become OWNER for compatibility with the original setup. Owners can save property settings and pricing. To give an account booking/payment access without settings/pricing access, an administrator can change its role to MANAGER in stayman_staff.

The migration adds property address, phone, timezone, arrival/departure times; a nightly rate per bookable unit; and a staff-only payment ledger. No admin secret is needed in the application.

## Pricing

Open Pricing in the sidebar. Apply a rate to all dorm beds or all private rooms, adjust individual room groups, and click Save all changes. Dorm rates are per bed per night; private rates are per room per night. A single transaction saves every submitted rate or none.

New reservation totals use the selected unit's saved nightly rate multiplied by the number of nights. Staff can enter a custom total. Changing prices does not rewrite existing reservations. Prices start at zero until configured.

## Payments

Open Reservations → View / pay, a guest's booking → Details, or an allocated stay in the matrix. Add payment accepts amount, cash/UPI/card/bank method, and an optional reference. Mark balance as paid pre-fills the remaining balance; confirmation records it.

Payment entries record money already received; they do not process or verify external payments. Payments cannot exceed the remaining balance. Database row locks prevent simultaneous overpayments. A request UUID prevents duplicate records when the same request is retried. History is append-only through the application; refunds and corrections are not included in this version.

Existing paid amounts are imported as OPENING balances. Their original collection dates were not stored, so they are shown separately from new dated receipts. New bookings with an initial paid amount also receive an OPENING/initial entry.

## Reports

Reports use real stored data, not sample chart totals. Occupancy includes reserved and checked-in unit nights, excludes checkout day and cancelled reservations, and subtracts maintenance from available capacity. Utilization measures occupied nights against total configured capacity including maintenance. ADR uses stay revenue divided by occupied unit nights.

Stay revenue allocates each reservation's total evenly across its booked nights. This is a booking-value report, not tax/accounting recognition. New payment receipts are grouped by payment timestamp in the property timezone; opening/initial balances are separate.

Reports support up to 366 days, previous/next periods, daily figures and CSV export.

## Settings and guests

Settings follows the reference's Property, Users, Preferences and System sections. Property and regional values save to Supabase. Users lists staff memberships; account creation and permission changes remain administrator operations in Supabase. INR is the supported currency.

Property name updates in the staff header/sidebar after saving. The public QR logo/name still uses the existing frontend property configuration; QR dates still use Asia/Kolkata.

Guest cards use green for a current stay, blue for future arrivals and a dashed outline for past/inactive records. Dates use the property timezone; checkout day is past. Current takes precedence when a guest has both current and future bookings. Cancelled bookings do not count as current/future.

## Verification

After running migration 007:
1. Save prices, refresh and create a booking; check nightly rate × nights.
2. Record a partial payment and confirm the outstanding balance.
3. Mark the remaining balance paid; refresh to confirm totals and history.
4. Try overpaying or recording twice with the same request ID: no duplicate or excess payment should be accepted.
5. Compare reports with reservations and payment rows, including checkout boundaries and maintenance.
6. Save property settings, refresh and confirm the property name and times.
7. Confirm anonymous guest sessions cannot read staff payments or call management functions.

Local syntax/build tests do not apply migrations to your hosted Supabase project.
