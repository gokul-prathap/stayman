# Walk-in inbox, guest IDs and sharing

Run migration 202610100010_walkin_inbox.sql once after 009, then refresh/redeploy.

## Reception QR and walk-ins

Open Guests → Reception QR. This permanent QR contains /guest-check-in?property=PROPERTY_UUID. The uploaded form is visible in Guests → Walk-ins awaiting allocation and in New reservation → Available web check-in guests.

For a single-property database, the old /guest-check-in URL still works and existing public submissions are assigned to that property automatically. In a database with multiple properties, old submissions with a null property_id must be assigned explicitly by an administrator after verifying which property owns them; they are never shown to every staff member.

Select a submitted person in New reservation. Contact details and dates are prefilled. Choose a bed and save; allocation and ID association happen together in one database transaction. The same submitted guest cannot be consumed by two bookings concurrently. For people travelling under an existing booking, use Reservation details → Link a submitted walk-in instead. This adds a guest under the lead booking and does not allocate an extra bed automatically. Check “This submission belongs to the booking contact” only after verifying the person.

## Guest profiles

Every guest card has Guest details / ID / web check-in. Submitted guests have blurred local placeholders; IDs and signed URLs are fetched only after clicking. If no submission exists, the profile states Web check-in not done and can create a link for an active reservation.

For an older group member already added manually, the booking contact profile can explicitly select the existing member record rather than trying to match by name automatically. Past guests without an active reservation can show/share the permanent reception QR from their profile. Their new submission appears in the walk-in inbox for allocation. Private links tied to a booking still require an active reservation.

## QR and WhatsApp

Creating a private link shows a local QR code, copy/open actions and a WhatsApp number field. Desktop opens WhatsApp Web, mobile opens WhatsApp's device link. The message is prepared with the check-in URL; staff presses Send in WhatsApp. No WhatsApp API, automated sending or messaging credentials are needed.

## Phone numbers

National digit limits come from libphonenumber metadata for ordinary fixed/mobile numbers, with the international 15-digit cap. India allows 10 national digits, US 10, UAE 9, Singapore 8. Letters are rejected, country changes cap the retained digits, and full number validation still runs before saving. Staff reservation, edit and WhatsApp fields share the same control. Supabase triggers also enforce national-number lengths by calling code; a frozen metadata snapshot is included in migration 010.

Property staff can read only their own property’s walk-ins and private IDs. Existing daily public-QR capacity remains 100 starts per Indian calendar day across this database.

QR codes use the address currently open in the browser. For phone scanning, open the deployed HTTPS site, or a reachable local network address when testing; localhost on a phone refers to the phone itself.
