# Room and bed management

Apply `supabase/migrations/202610200021_room_management.sql` after migration 020. It is safe to rerun. The migration adds inventory RPCs, archive state, an allocation guard and owner/admin audit records. No room or reservation is deleted or repriced by this migration.

Property owners open **Rooms & Beds** in their normal workspace. Platform administrators open `/godfather`, select **Property setup / logo**, and use the **Rooms & beds** section. Administrators need no staff membership to manage a property's inventory. Managers/reception can read inventory but cannot add, rename, edit or archive it. Staff maintenance controls remain in the tape chart.

Use **Add room / bed** once for each bookable unit. A private room is one unit. For a dorm, add each bed with the same room name and a distinct bed label, for example Pepper / Bed 1 and Pepper / Bed 2. Unit creation includes an initial nightly rate. Standard rate changes remain in Pricing and never automatically reprice confirmed bookings.

Use **Rename room** to change the name across every active bed/unit in that room. **Edit** changes one unit's name, label, type or gender policy. Existing IDs and allocation references are preserved. Type changes are blocked once a unit has allocation history; gender changes are blocked while current or future allocations exist. Duplicate labels within the same room are rejected case-insensitively.

Capacity is the number of active bookable units, not a separately editable number. Add beds to increase it. Archive a bed/unit to reduce it. Archiving requires confirmation and is rejected if any current/future reservation or maintenance allocation remains. It preserves past records and prevents future allocations at the database level, including legacy booking RPCs. There is no permanent-delete action and no restore action in this version. Archived rows remain visible through **Archived history**.

Active units appear in booking choices, pricing and the operational tape chart. Archived units are retained for reservation-detail lookup and historical occupancy reports. Reports count archived units before their archive date in the property's timezone; current inventory excludes them. Historical tape-chart rows for archived units are not displayed in this version; use reservation history and reports for those records.

Invoices now omit the operational room/bed-name field. The accommodation line, booking reference, arrival, departure and number of nights remain. Existing issued invoice snapshots are not rewritten by room edits, archiving, or this display change.

Validation: `node tests/room-management-database.mjs`, the `tests/*.test.mjs` regression suite, and `npm run build`. Database tests use isolated synthetic PostgreSQL-compatible data, not a live Supabase project.
