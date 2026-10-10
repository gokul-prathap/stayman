# Dashboard, grouped web check-in and refunds

Apply supabase/migrations/202610100009_booking_guest_workflows.sql once in Supabase SQL Editor after migrations 001–008. Redeploy the application afterward. The migration preserves existing completed check-ins.

## One reservation, several guests

Open the reservation and find **Group web check-in**. Add the lead guest and each accompanying person separately. Copy each private link and send it to that person (or let them open it at reception). Each link allows one guest submission with two compressed ID photos. Dates come from the reservation. Staff can refresh status to see how many guests have submitted.

Links are shown only when created; **Generate new link** invalidates the previous link for an unfinished guest. Completed details are immutable, separate from the editable booking contact. Submitted names are self-reported; this does not verify email ownership or match names against IDs.

The permanent reception QR remains independent. Existing public QR submissions are not automatically associated by name or phone: those values are not reliable proof of a booking. Use the reservation's per-person links for linked group check-ins. Adding group members does not allocate additional beds automatically.

In **Guests**, booking members appear alongside booking contacts. In reservation details, expand a submitted guest to view form details. The blurred ID placeholder is generated locally; no ID image or signed URL is requested until **Click to load ID**. Signed URLs expire after two minutes and require property staff access.

## Refunds

Cancelling a paid booking presents its remaining net paid amount as **Pending**. Use **Record refund** after returning money and record amount, method and reference. Partial refunds stay Pending; fully returned refunds show Done. **Reports → Refunds** shows all outstanding refunds plus returned amounts/transactions for selected dates. Payment history is preserved. This records refunds; it does not initiate a bank transfer. No cancellation fee is deducted automatically.

## Reservation editing

**Edit reservation** changes the booking contact name, phone, email, notes and stay dates. Date changes show a quote using the unit's current nightly rate, preserve payments, and check conflicts atomically on save. Checked-in arrival dates cannot change. Date edits for split bed assignments are blocked to avoid rewriting individual night moves. Names/contact/notes remain editable. Audit records are stored in stayman_reservation_edits.

## Dashboard and login

Dashboard figures use property data and timezone, with animated gradient occupancy, Indian rupee amounts, recent activity and quick actions. Occupancy measures booked units; maintenance reduces available capacity. Login uses CSS/SVG artwork without an image download or animation dependency, adapts to small screens and respects reduced-motion preferences.
