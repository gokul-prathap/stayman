# Guest register

Guests now defaults to All stays and 25 rows per page, retaining 10/25/50 choices,
server-side search, stay filters, web check-in filters and pagination. The compact
register shows guest, contact, booking/source, room/bed, arrival, departure,
travel route, document screening status, stay/booking status and actions.
Its header and guest column stay visible while scrolling. Expand a guest to see
booking-level totals and assignment periods; View / ID opens the existing private
guest profile and on-demand ID photos. Walk-ins can allocate a bed directly.

Apply `supabase/migrations/202610190017_guest_register_columns.sql` after migration
016 to populate the extra columns. The wrapper preserves the original directory
filtering and pagination, adding only the selected page's contact, route,
room assignment and booking payment summary fields. Every query is scoped to
the requested property and the staff access check. It does not return document
numbers, OCR text, identity images or signed image URLs. Older databases continue
to return the original columns, but new fields show placeholders until upgraded.

Document labels are Not submitted, Submitted, Text detected and Review required.
There is no Verified label: browser screening cannot verify identity or authenticity.
Booking totals and balances apply to the whole booking, including for group members.
The room column summarizes unique units and preserves all split-date assignments
in its tooltip and expanded details. Missing allocation data is never filled with
another guest's room or document information.

Stay View now defaults to 7 nights; 14- and 28-night views remain selectable.
