# Stay View

The `/stayview` stay view now defaults to 7 nights, with 14- and 28-night
options, previous/next range controls, Today and a date picker. Dates start in
the property's timezone. The chart uses compact continuous stay bars, sticky
room labels, date headers and availability/occupancy rows in a bounded scroller.

Each actual dorm or room can expand/collapse independently. Expand all / Collapse
all, inventory type/room filtering and guest/room/bed search work locally on the
loaded property inventory. Groups are expanded initially so stays and maintenance
are immediately visible. Collapsed groups show both free units and blocked/booked counts.
No room categories or physical bed capacities are inferred from room names.
A private room counts as one bookable unit, consistent with the existing model.

Summary cards are a snapshot for the first visible date and shown inventory.
Daily occupancy includes checked-in and reserved nights, divided by total units
minus maintenance blocks and unresolved holds. Normally cancellation removes its
allocations. If a physical allocation remains for a cancelled or missing booking,
it is shown as Held / review, since the database still rejects overlaps with it.
No physical blocking allocation is silently hidden. Checkout nights
are free. Conflicting allocations display a conflict indicator; overlaps cannot
be created through the existing database exclusion constraint.

Booking creation selects an available default instead of blindly selecting the
first unit. Its availability check uses the latest loaded property data and
refetches immediately before saving. Conflicts identify the unit and allocation
dates, including conflicts on nights after arrival. Reservation and maintenance
bars and the legend use filled status colors.

Click an empty night to create a prefilled booking. Click a stay bar to open the
existing reservation details and one-night move selector; the clicked night is
preserved even inside a multi-night bar. Dragging to another free bed moves only
the dropped night, after availability, gender and price checks and confirmation.
The existing details panel continues to provide payment, check-in, checkout,
cancellation, stay extension and full date-range moves. A blocked bar opens the
existing release confirmation, which releases the entire selected block.

## Date-range blocking

Apply `supabase/migrations/202610190016_stay_view_blocks.sql` after migration 015.
It adds the staff-authorized `stayman_block_unit` RPC used by the Block bed action.
Blocks cover 1–366 nights and exclude the Available again date. Each block is one
transactional allocation; overlapping bookings or blocks are rejected by the
database constraint. This migration does not modify or delete existing data.

Until migration 016 is applied, browsing and existing booking actions work, but
date-range blocking displays a setup message. Property data refreshes every 30 seconds.

Validation: `node --test tests/stay-view.test.mjs tests/allocation-move.test.mjs tests/booking-actions.test.mjs`
and `node tests/stay-view-render.mjs`. A connected browser was unavailable for
visual verification; test on desktop and mobile before publishing. The SQL RPC
also needs verification against a configured Supabase test property.
