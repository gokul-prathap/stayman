# Aiosell setup, pricing, bookings and troubleshooting FAQ

Reviewed: 2026-10-24. Applies to Stayman source through migration 048. Confirm the deployed version before relying on a new feature. Prices, room numbers and identifiers in the case notes are examples for one property, not defaults for other properties.

Read [operating instructions](instructions.md) for complete procedures and [case notes](case-notes.md) for the evidence and unresolved parts of this setup. Authority and source references are listed at the end.

## Understand the connection

### AIO-001 | What connects to what, and where do room names come from?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Where do the dropdown rooms come from?","Are these Stayman or Aiosell room IDs?"],"related":["AIO-002","AIO-008"]} -->

**Answer:** The distribution chain is Stayman physical units → Aiosell room categories and rate plans → OTA rooms/rate plans such as Booking.com. Stayman supplies the room/bed names on the left. The category dropdown comes from a real Aiosell property fetch. Saving connects stable identifiers; matching similar names alone does not establish a connection.

**Where:** Admin → Properties → selected property → Aiosell → Room mappings. Aiosell-to-Booking.com mapping is maintained in Aiosell, not in Stayman's category dropdown.

**Verify:** Trace one physical unit through all three systems using its category and actual OTA room/rate-plan identifiers. Never substitute a numeric Booking.com ID for an Aiosell category code. Preview categories are synthetic and must not be copied into live configuration.

### AIO-002 | Who sets up Aiosell: the owner or platform administrator?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Why does setup need owner access?","Where is the admin Aiosell page?"],"related":["AIO-003","AIO-004"]} -->

**Answer:** Platform administrators configure the property association, room matches, guest rules and supported booking-site controls. Owners review the saved offering and operate sales switches and automatic updates. Both views read the same saved property-scoped configuration.

**Where:** Administrator: `/godfather` → Properties → property → Aiosell. Owner: Settings → Aiosell. Admin's owner preview is read-only; it is not a login as the owner.

**If it fails:** A legitimate admin configuration action should not fail with “Owner access required.” Verify the deployed admin/owner separation migrations, authenticated role and correct page. Do not grant unnecessary owner membership as a workaround or use shared credentials.

### AIO-003 | What is the initial setup process?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["How do I connect a new property?","Steps to map in Aiosell settings"],"related":["AIO-008","AIO-015","AIO-019"]} -->

**Answer:** Find the supplied hotel ID, verify the returned property, save its association, review physical-unit matches and guest rules, then save the offering for owner review.

**Steps:**
1. Fetch the actual Aiosell hotel. Check identity, currency, timezone and categories; do not save a guessed property.
2. Choose Save verified association. A saved ID alone is incomplete setup.
3. Match each active unit or explicitly exclude it. Verify selected rate plans, positive prices and private-room guest rules.
4. Review setup and save with the displayed primary action, currently Save & restart updates.
5. The owner reviews the saved offering and selects Start selling online when eligible.
6. Check actual stage results and downstream availability. Enable Automatic updates if continuous delivery is wanted.

**Verify:** The owner reaches a ready/reviewable state; activation then obtains appropriate Aiosell acknowledgement. See procedure AIO-RUN-001. Existing mappings use the additional closure procedure, not an initial-setup shortcut.

### AIO-004 | What does “Aiosell setup is incomplete” mean?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Your administrator needs to finish connecting your property","Why is Start selling online missing?"],"related":["AIO-015","AIO-016","AIO-017"]} -->

**Answer:** The saved configuration has not passed readiness checks. Repeated syncing does not fix missing configuration.

**Check:** Setup must be verified; at least one mapping must exist; the saved hotel's verified snapshot must have supported INR currency; mapped active units must resolve to a positive common price; private-room guest rules and required occupancy-plan coverage must be present. A bed normally has no private-room guest-rules object; this is not itself an error.

**Next:** Admin reviews the actual failing mapping and stored guest rules. A successful hotel-ID save, HTTP 200 or closure does not make the offering ready. Do not manually flip readiness/approval database fields to hide a validation failure.

### AIO-005 | Can I change the hotel ID after setup?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Replacing sandbox hotel ID","Hotel code cannot change after receiving bookings"],"related":["AIO-006","AIO-020"]} -->

**Answer:** Previewing another ID does not replace the active association. Replacing an association with published mappings requires the guided old-inventory closure and explicit review. Existing linked Aiosell bookings block hotel replacement in the current implementation, including cancelled/test links.

**If blocked:** Determine whether links belong to real reservations or a confirmed sandbox-only exercise. Production booking migrations need a plan for future modifications/cancellations under the old/new hotel ID; a new ID does not automatically transfer links. Ask Aiosell what identifiers future webhooks will use.

**Stop:** Do not directly overwrite `hotel_code`, delete production booking links or detach reservations to bypass the guard. Current software does not implement a general cross-hotel booking migration.

### AIO-006 | There are no real bookings, only sandbox tests. Why is replacement blocked?
<!-- faq: {"category":"aiosell","audience":["platform-admin","support-engineer"],"status":"case-confirmed","last_reviewed":"2026-10-24","aliases":["Both are tests","No bookings but hotel code is blocked","Reset sandbox connection"],"related":["AIO-005","AIO-007","AIO-032"]} -->

**Answer:** The guard checks integration booking-link records, not whether a guest name looks real. This case had two old sandbox links even though the user described the bookings as tests.

**Recovery:** An authorized operator must first identify the exact property and old sandbox hotel, inspect links/reservations/events and confirm the scope with the owner. Preserve production reservations, guests, payments and prices. Record a recovery/backup plan, handle any active worker and reset only the confirmed obsolete integration state.

**Important:** Removing links alone can leave a stale review event, mappings, pending transition or old channel targets. These are separate records. A sandbox reset does not close remote inventory. No generic destructive cleanup SQL is included in this library; do not reuse a historical property-specific delete against another property.

### AIO-007 | Why is an old test booking still shown in “Bookings needing attention”?
<!-- faq: {"category":"aiosell","audience":["owner","support-engineer"],"status":"case-confirmed","last_reviewed":"2026-10-24","aliases":["Gokul Testing still appears","Unmatched online room after sandbox reset"],"related":["AIO-006","AIO-034"]} -->

**Answer:** The review entry comes from a stored webhook event. Deleting a booking link or resetting a connection does not automatically remove that event.

**Next:** If explicitly confirmed as a sandbox event, an authorized operator identifies it by property, exact booking ID, old payload hotel ID and review status, then follows a scoped cleanup/archive procedure. Names alone are not sufficient. The case's event and hotel identifiers must not become global cleanup rules.

**Stop:** Do not create a live reservation merely to dismiss an obsolete sandbox review, and do not mark a real unprocessed event successfully reconciled without checking its booking.

## Room matching and prices

### AIO-008 | What should I select for each bed or private room?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["What do I fill in each mapping?","MDRA Bed 3 is checked","Is the mapping correct?"],"related":["AIO-001","AIO-009","AIO-010"]} -->

**Answer:** Select the fetched Aiosell category representing that actual Stayman unit or compatible group. For an individual-bed setup, each bed matches its corresponding bed category. A private room matches its private-room category, not a dorm bed.

**Checkbox meaning:** The checkbox under Technical details selects a rate plan inside that category; it does not add the named bed to a private-room mapping. In the case screenshot, MDRA Bed 3's own rate-plan checkbox was correct.

**Verify:** Check type, gender policy, physical-unit identity, nightly price and selected plan IDs. Excluded units are not managed through that mapping. Never assume an excluded remote category is closed; verify it with Aiosell.

### AIO-009 | Can several units share an Aiosell category?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Each room code must be unique","Duplicate room mapping","Can I add another mapping?"],"related":["AIO-010","AIO-029"]} -->

**Answer:** Yes, if the category represents an aggregate room type. Store that category once with compatible units inside its mapping. Do not create duplicate category rows for separate occupancy plans or reuse a physical unit in multiple mappings.

**Rules:** Units must be active and belong to the selected property, share the same unit type/gender policy and resolve to the same nightly price for shared pricing. Multiple rate plans belong inside the one category mapping and share its inventory.

**If it fails:** “Each room code must be unique” means duplicate category entries, not necessarily identical displayed Stayman room labels. Check stable category codes and unfinished rows before changing anything.

### AIO-010 | What if Room 101 is ₹2,000 and Room 201 is ₹2,500?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Different prices for individual rooms","Workaround for mapped units have different prices"],"related":["AIO-009","AIO-011","AIO-016"]} -->

**Answer:** Use separate Aiosell room categories for rooms with different standard prices, or deliberately align their prices if they truly belong in one shared-price category. Do not let one category arbitrarily choose between different physical-unit prices.

**Example:** Room 101 → `private-room`, Room 201 → `private-room-2`, using each unit's own Stayman price. These are case examples, not required room names or universal remote codes.

**Meaning of error:** `executive: Mapped units have different prices` identifies an unresolved shared-category price conflict. Check whether this is an old sandbox mapping before editing the new property's legitimate prices. Never change a live price solely to satisfy a stale sandbox category.

### AIO-011 | Where should a manager change room prices?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Do I have to update Aiosell settings every time?","Can Pricing reflect here?"],"related":["AIO-012","AIO-013"]} -->

**Answer:** Use Stayman's Pricing page for daily prices; platform admin has a property-scoped Pricing tab using the same unit-rate source. Room matching is setup work, not the routine price editor.

**Verify:** First confirm “saved in Stayman,” then examine delivery results. Existing reservation totals are not automatically repriced when standard nightly prices change. A failed remote delivery must not cause a saved local price to be discarded.

**If it fails:** Distinguish a failed local save from a successful local save followed by failed/offline delivery. For the latter, repair the connection and retry saved data rather than retyping or changing the price randomly.

### AIO-012 | What does “Prices saved in Stayman. Automatic delivery is off or not configured” mean?
<!-- faq: {"category":"aiosell","audience":["owner"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Prices saved but Booking.com unchanged","Automatic delivery is off"],"related":["AIO-013","AIO-004","AIO-028"]} -->

**Answer:** The local price save succeeded. The message does not confirm a rate push. Automatic updates may be off, or the connection may not yet be approved/configured for automatic delivery.

**Steps:** Finish admin setup and owner activation if required. Turn Automatic updates on, then inspect the resulting queued/delivery state and rates-stage acknowledgement. If a valid price change remains unsent, diagnose the actual queue/result instead of treating the save message as an API failure.

**Stop:** Do not reset mappings or change amounts when the issue is simply delivery state. See AIO-RUN-004.

### AIO-013 | What does Automatic updates do, and what happens when it is off?
<!-- faq: {"category":"aiosell","audience":["owner"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Enable background sync","Does turning sync off stop bookings?","Why is auto_sync false?"],"related":["AIO-012","AIO-014","AIO-025"]} -->

**Answer:** When enabled on an active connection, Stayman automatically delivers eligible price and availability changes. Turning it off does not close sales or disable incoming reservations. Online rooms can remain on sale with stale published data.

**Independent controls:** Manual room/site sales changes can still queue and attempt immediate sales delivery while automatic updates are off. Such a sales-only update skips rates; “Rates: Not requested” can therefore be expected. Turning updates back on preserves deliberately closed rooms/sites and makes pending automatic delivery eligible; it is not proof that delivery has finished.

**Verify:** Inspect actual per-stage results and the selected property's automatic-update setting. Incoming webhook acceptance, automatic outbound delivery and sales permission are separate.

### AIO-014 | Why does a scheduled update take around a minute, and will it create excessive calls?
<!-- faq: {"category":"aiosell","audience":["owner","deployment-operator"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Why two minutes?","Scheduler every 60 seconds for 50 properties","Do bookings sync immediately?"],"related":["AIO-025","AIO-037"]} -->

**Answer:** Queue/scheduler cadence and worker availability affect when an eligible job runs. A scheduler invocation is not the same as a full update for every property. Current claims consider eligible enabled connections with automatic/manual work, revisions, retry timing and leases; unchanged/noneligible connections need not produce full provider pushes.

**Limits:** Do not promise a fixed completion time or a cost without deployment usage and provider billing evidence. Manual requests can still encounter an active worker or delayed retry. The conversation proposed future optimization; do not describe future queue/cost improvements as already deployed.

**Verify:** Compare relevant revisions, pending work, lease expiry, retry time and actual function/provider logs. Check scheduler configuration before creating another cron job.

### AIO-015 | What are “guests included,” “maximum guests” and “extra guest charge”?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["I don't get guest pricing","Maximum how many guests?","Extra one is 500"],"related":["AIO-016","AIO-017","AIO-018"]} -->

**Answer:** Guests included is how many guests the standard room amount covers; maximum guests is the allowed room capacity; extra guest charge applies only above the included allowance. These are not separate rooms or bed inventory.

**Example:** Base ₹2,000 includes 2, maximum 3, extra ₹500 gives ₹2,000 for one/two guests and ₹2,500 for three. A ₹2,500 base with the same rule gives ₹3,000 for three. This model requires actual room capacity and appropriate remote plan support.

**Verify:** Use actual Stayman base prices and fetched Aiosell occupancy. Do not treat the example as a permission to raise capacity. The price calculation for fewer guests is supported after migration 048.

### AIO-016 | Can one and two guests pay the same standard private-room price?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Those are standard rates","Why is one guest below guests included rejected?","What to change for flat room rates?"],"related":["AIO-015","AIO-018","AIO-037"]} -->

**Answer:** Yes. With migration 048 and the corresponding frontend, an occupancy plan can be below the included allowance. Included 2 does not mean minimum occupancy 2. Plans for 1 and 2 guests both use the base room amount; charges apply only above 2.

**Setup:** For a room that permits a maximum of 2, set included 2, maximum 2, and use actual plan occupancies 1 and 2. A stored ₹500 extra charge is unused while maximum equals included. Set each physical room's own base amount in Pricing.

**Verify:** Case expectation: Room 101's two plans resolve to ₹2,000; Room 201's two plans resolve to ₹2,500. Two occupancy plans still reserve one room once. Migration 048 does not populate missing guest rules or silently change stored mappings/prices.

### AIO-017 | Can I enter maximum 3 if Aiosell says maximum 2 and extra_adult is 500?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"case-confirmed","last_reviewed":"2026-10-24","aliases":["Can I add a third guest now and update later?","Aiosell extra_adult 500 but max_occ 2"],"related":["AIO-015","AIO-018","AIO-019"]} -->

**Answer:** Not with that remote configuration. This case's fetched private-room categories had `max_occ: 2`, plans of occupancy 1/2 and `extra_adult: 500`. The extra-adult amount did not raise remote capacity or create a three-guest plan.

**Now:** If correct for the real property, use maximum 2 and actual plan occupancies 1/2. A ₹500 local extra charge does not apply while capacity stays 2.

**Later:** Ask Aiosell to configure actual permitted capacity and suitable three-guest pricing support, fetch the updated details, then review new Stayman rules. Stayman's current readiness checks require explicit coverage for included through maximum guest counts. Do not relabel a two-guest plan as three or assume a capacity change will reprice existing reservations.

### AIO-018 | Do s-ep and d-ep mean one/two guests, or two/three guests?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["What guest count should each plan have?","Single and double plan codes"],"related":["AIO-016","AIO-017"]} -->

**Answer:** Never infer occupancy from a code suffix alone. Use the actual fetched `occupancy` or Aiosell confirmation for that property/category/plan.

**Case evidence:** Returned `private-room-s-ep` and `private-room-2-s-ep` had occupancy 1; their corresponding `d-ep` plans had occupancy 2. This supports entering 1/2 for those specific plans. It is not a guarantee about another property's similarly named plans.

**If it fails:** “Guest count does not match the Aiosell rate plan” means the selected count contradicts returned occupancy. Correct the local selection or ask Aiosell to provision the needed plan; do not bypass the check.

### AIO-019 | Why do I get “Check included guests, maximum occupancy and extra-guest price”?
<!-- faq: {"category":"aiosell","audience":["platform-admin","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["I put 2 but still can't save","Same guest pricing error again"],"related":["AIO-017","AIO-021","AIO-022"]} -->

**Answer:** This is configuration validation, not a sync failure. Included/max counts must be valid positive whole numbers, maximum must not be below included or above fetched remote capacity, and the stored extra charge must be a valid nonnegative whole-paise amount within the supported validation bounds.

**Check:** Inspect every affected private-room mapping, not just the visible one. The UI's rupee amount is converted to paise; ₹500 is 50,000 paise. Missing values and an old persisted proposal can explain a repeat even after the visible form seems corrected. Blank plan guest counts are an additional readiness problem, but do not assert they are the sole cause of this exact message.

**Recovery:** Read the pending proposal and remote limits first. If the proposal is wrong, use Discard proposed change, refetch and rebuild correct values. Inventory stays closed after discard. Do not repeat closure or force database flags to clear a guest-rule validation error.

## Guided saving and delivery

### AIO-020 | Why must I close inventory before removing or renaming mappings?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Pause a fully stop-sold connection before removing a room mapping","Close existing inventory and pause before removing or renaming","Tick Stop sell on every saved mapping"],"related":["AIO-021","AIO-023"]} -->

**Answer:** Changing the local category association without closing its published inventory could leave old rooms bookable online. The guard protects against that orphaned inventory.

**Current process:** Use the guided Save & restart updates action instead of manually changing hotel IDs/mapping JSON. Current implementation conservatively closes all old mapped categories because the pause guard requires full old-inventory closure. The scope is the configured rolling window, not every future date.

**Verify:** Aiosell accepts the exact closure revision; the administrator checks remote zero availability before final apply. Existing reservations are retained. An intentionally closed room/site must not be reopened automatically as a side effect.

### AIO-021 | What happens when I click Save & restart updates?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["How to save after saving?","Do I click finish and restart?","All HTTP requests are 200 now what?"],"related":["AIO-022","AIO-023","AIO-024"]} -->

**Answer:** For existing mappings, Stayman stores a proposed change, closes the old inventory, waits for acceptance/verification, then applies the proposal through Finish save & restart updates. Initial setup can instead prepare owner review directly.

**Stages:** Review inputs → confirm scope → closure queued/sent → closure accepted → administrator verifies remote zero availability → finish saved proposal → restart eligible delivery or require owner review. The card disappearing after successful finish is useful evidence of completed apply; an accepted closure alone is not completed mapping setup.

**Failure behavior:** Closure failure retains old association and saved proposal. Final validation failure leaves the old association/closure intact. A delivery failure after apply retains the newly saved mappings. See AIO-RUN-002.

### AIO-022 | I changed a field but Finish still uses the wrong value. Why?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Maximum changed to 2 but old error remains","Finish applies previous proposal","How to discard and save again?"],"related":["AIO-019","AIO-021"]} -->

**Answer:** Finish applies the server-stored proposal, not arbitrary later edits in the visible form. Inputs can also be disabled while a transition is pending. This protects the reviewed target from changing during closure.

**Steps:** Inspect the stored proposal. If wrong, select Discard proposed change, refetch the property, correct both private-room mappings and plan counts, review and save a new proposal. Discard does not reopen inventory. Do not imply that discarding rolls back the remote closure.

**Verify:** Inspect the replacement proposal and final saved mappings. If the same validation repeats after a genuinely rebuilt proposal, diagnose the specific category, remote limits and values instead of repeating these steps again.

### AIO-023 | What does stop-sell mean, and why is the finish button disabled?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["What is stop sell?","Closure needs checking","Can I tick zero availability now?"],"related":["AIO-020","AIO-024"]} -->

**Answer:** Stop-sell closes new online sales in the applicable scope. It does not cancel existing reservations. In technical mapping data, `stopSell: true` means closed; owner-facing Sell online uses the opposite positive meaning.

**Finish eligibility:** The exact closure must be accepted and the administrator must independently verify zero availability in Aiosell before ticking the verification checkbox. The checkbox is an attestation, not an action that closes rooms. HTTP 200 alone does not satisfy either check.

**Next:** After actual closure acceptance and verification, click Finish save & restart updates. If closure is already accepted, another closure retry is not needed merely to fix a guest-rule error.

### AIO-024 | Everything is green. Is Booking.com live now?
<!-- faq: {"category":"aiosell","audience":["owner"],"status":"provider-verification-required","last_reviewed":"2026-10-24","aliases":["Is it live?","All are green","HTTP 200 success means live?"],"related":["AIO-025","AIO-027","AIO-028"]} -->

**Answer:** Not proven. Green can mean a closure was accepted, a site setting was accepted, or an individual stage succeeded. Aiosell acceptance is not confirmation of Booking.com's final rates or bookability.

**Verify in order:** Saved correct mappings/prices; no pending mapping transition; owner approval/active connection; intended room/site sales permissions; accepted reopening inventory and rates; Aiosell counts/prices for an unbooked date; Booking.com Extranet for the same room/date/guest count; then an appropriate public availability check.

**Stop:** Never call a property live based only on green site controls, a success popup or HTTP status. Read individual response stage statuses and scope.

### AIO-025 | What does “No pending inventory sync. Another worker may be active” mean?
<!-- faq: {"category":"aiosell","audience":["owner","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Retry closure says no pending inventory sync","Another worker may be active still showing"],"related":["AIO-021","AIO-026"]} -->

**Answer:** The request did not claim an eligible inventory job. It does not prove a worker is active. Work may already be complete, leased, waiting for retry timing, or not eligible under the current connection state.

**Next:** Refresh state once and inspect pending transition, current/accepted revisions, manual/automatic flags, retry time, lease expiry and latest stage results. If the closure for the current revision is accepted, proceed to verification/finish instead of clicking Retry closure repeatedly.

**Limit:** Retry update is not a guaranteed full republish of unchanged data. If an external OTA mapping was corrected but nothing is queued, request a targeted provider resend through the supported Aiosell workflow or support; do not reset Stayman mappings to manufacture work.

### AIO-026 | Why does the response say “partial” or “failed” even when some stages are sent?
<!-- faq: {"category":"aiosell","audience":["owner","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Inventory sent rates failed restrictions pending","Sync partially completed but status failed"],"related":["AIO-010","AIO-013","AIO-032"]} -->

**Answer:** Inventory, rates and restrictions have separate results. Read them individually, together with current revision and scope. The generic popup wording may say partial even when all requested stages failed; this is not evidence of any success.

**Examples:** Rate-price conflict needs mapping/pricing correction. Missing supported restriction targets can leave restrictions pending while inventory/rates succeed. A sales-only manual update while automatic prices are off intentionally skips rates. A 403 requires authorization/target diagnosis. Preserve successful local saves and independent accepted settings while repairing the failed stage.

### AIO-027 | My Booking.com switch is green but room switches are off or say Update failed. Am I selling?
<!-- faq: {"category":"aiosell","audience":["owner"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Booking sites enabled but rooms disabled","Rooms online update failed"],"related":["AIO-024","AIO-028"]} -->

**Answer:** The site-level permission alone does not establish room-level selling. Bookability also needs room permission, date availability, restrictions and downstream application.

**Next:** Refresh and compare desired room setting (`stopSell`) with its last accepted open state (`sales_ack`), pending work and latest error. A switch can show an old acknowledgement while a new request has failed. Retry the intended pending action first; do not blindly invert every switch or overwrite deliberate closures.

**Verify:** Intended rooms report enabled/accepted and correct Aiosell availability, then check Booking.com. In this incident a later read-only query confirmed all ten categories desired open and acknowledged open with no pending transition/error; the old screenshot was not current evidence of closure.

## Booking.com and channel setup

### AIO-028 | Booking.com prices are blank although Stayman and Aiosell look correct. Where do I check?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"provider-verification-required","last_reviewed":"2026-10-24","aliases":["Booking.com lost all prices","Prices are blank","How and where to verify rates?"],"related":["AIO-029","AIO-030","AIO-031"]} -->

**Answer:** Check Booking.com Extranet's Rates & Availability → Calendar (labels can vary), not only the public date picker. Use one room, future date and guest count inside Stayman's sync window. Distinguish a genuinely blank rate from a loaded rate blocked by availability/restrictions.

**Steps:** Compare Stayman Pricing/Stay view, Aiosell rates/availability, and Extranet Standard Rate, room status, rooms to sell and restrictions. If Aiosell is correct but Extranet is blank, check Aiosell's Booking.com property, room and rate-plan mapping and its downstream delivery response. Stayman cannot read those final Booking.com results from its green acknowledgement alone.

**Escalate:** Give Aiosell the hotel ID, Booking.com property/room/rate-plan IDs, exact dates/occupancy, expected price, actual result and latest redacted delivery error. Ask for a corrected resend and Booking.com acceptance evidence. Do not assert a propagation delay, deleted prices or provider fault without evidence.

### AIO-029 | All four beds map to the same Booking.com room ID. Is that correct?
<!-- faq: {"category":"aiosell","audience":["platform-admin","support-engineer"],"status":"provider-verification-required","last_reviewed":"2026-10-24","aliases":["Four MDRA beds share one OTA ID","Only one bed available despite four beds","Will updates overwrite each other?"],"related":["AIO-009","AIO-028"]} -->

**Answer:** It can be legitimate if the OTA room type represents a bed pool, but Aiosell must correctly aggregate the separate source categories. The mapping screenshot alone cannot prove that it sums inventory rather than overwriting successive absolute counts.

**Verify:** Ask Aiosell explicitly how this many-to-one arrangement is aggregated, including reservation allocation. For a date when all four physical beds are available, a four-bed pool should offer four beds. If three are booked or blocked, one may be correct. Check actual Stayman allocations before diagnosing an undercount.

**Stop:** Do not set every individual category to availability 4, multiply room counts by the number of rate plans, or assume same-ID mapping is always wrong. Booking.com availability belongs to the room type and applies across rates.

### AIO-030 | Private-room rates appear under the wrong Booking.com room, or one room has no rates. What should I verify?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"provider-verification-required","last_reviewed":"2026-10-24","aliases":["Double Room price missing","Deluxe should be 2500 but shows 2000","Room mapping fixed but prices still wrong"],"related":["AIO-001","AIO-028","AIO-031"]} -->

**Answer:** Trace both the Aiosell-to-OTA room association and the rate-plan association below it. A correct room ID does not prove the plan ID, occupancy encoding or last rate delivery is correct.

**Case:** Stayman Room 101 was ₹2,000, Room 201 ₹2,500. The supplied mapping associated their categories with Booking.com Double Room and Deluxe Double Room. A later Extranet screenshot still showed Double Room missing rates/closed and Deluxe at ₹2,000. The user reported correcting an Aiosell mapping, but final downstream resolution was not established.

**Next:** Verify exact IDs from the current property rather than reusing this case's IDs. Compare Standard Rate for the same date/guest count, review Extranet's “Possible issues,” and request the provider's actual response/resend. Do not claim an exact root cause such as swapped plans until the trace confirms it.

### AIO-031 | Can both Aiosell occupancy plans map to one Booking.com rate ID? What about discounted plans?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"provider-verification-required","last_reviewed":"2026-10-24","aliases":["Single and double both have same rate ID","Non-refundable and weekly rates are different","Do I add a discount percentage in Aiosell?"],"related":["AIO-016","AIO-030"]} -->

**Answer:** A shared rate ID can be appropriate when the provider encodes guest counts according to Booking.com's configured pricing model. It is not inherently a duplicate error and not proof of correct mapping. Aiosell must confirm the supported occupancy/pricing translation.

**Discounts:** Compare Standard Rate first. Non-refundable/weekly/derived offers may intentionally differ according to OTA/provider rules. Stayman's current base/extra-guest configuration does not prove a generic Aiosell discount-percentage API or OTA commission calculation exists. Verify the actual discount rule and final amount instead of inventing a field or subtracting commission automatically.

**Evidence:** Booking.com documents multiple pricing types; matching the correct room-rate model matters. A pricing-type change can remove existing prices and require re-pushing them, but this was not established as the cause of this incident.

### AIO-032 | How do I diagnose Aiosell HTTP 403, “Access Denied,” or “Aiosell rejected the update”?
<!-- faq: {"category":"aiosell","audience":["platform-admin","deployment-operator"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Aiosell HTTP 403","Access Denied hostarica-pms","Inventory rejected the update"],"related":["AIO-005","AIO-026","AIO-038"]} -->

**Answer:** Identify the failed operation first: property fetch, inventory, rates or targeted restrictions. HTTP 403 indicates the provider denied that request; do not assume every stage or credential is necessarily wrong. A generic rejection needs the provider's redacted business response.

**Check:** Saved hotel ID versus proposed hotel ID; managed outbound partner path/username; access granted to that hotel; current server-side secret configuration; whether a restriction target is valid for inventory operations. Old sandbox IDs/categories with new partner credentials are a distinct possibility, not a diagnosis without saved-state evidence.

**Escalate:** Ask Aiosell to confirm outbound API authorization for the exact hotel/partner/operation. Never use the human dashboard password as an API password unless Aiosell explicitly provisioned it for that purpose. Never paste secrets into a support FAQ, URL, client code or screenshot.

### AIO-033 | What are restriction targets, and why were no connected inventory channels returned?
<!-- faq: {"category":"aiosell","audience":["platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["No connected inventory channels returned by Aiosell","Restrictions pending no inventory channel targets","Confirm reconciled?"],"related":["AIO-026","AIO-027"]} -->

**Answer:** Restriction targets identify supported channel recipients for sales restrictions. Returned inventory-operation targets can be verified by an administrator for owner sales controls. A reservation-operation partner ID or arbitrary guessed string is not automatically an inventory restriction target.

**Limits:** Returned channels do not prove full OTA provisioning or downstream health. A failed discovery request means setup could not be checked, not that no channels exist. Missing supported targets can leave restrictions pending independently of inventory/rates.

**Next:** Verify the target and targeted stop-sell capability with Aiosell. Administrator verification records a supported capability; it does not remotely provision the OTA. Do not use an arbitrary checkbox or hardcoded OTA catalogue as proof of a connected channel. Owner booking review uses guided link/create actions, not a raw “Confirm reconciled” shortcut.

## Reservation delivery, operations and deployment

### AIO-034 | Aiosell says a reservation was sent, but it is not in Stayman's reservations. Where is it?
<!-- faq: {"category":"aiosell","audience":["owner","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Webhook invocation exists but reservation absent","Reservation status REVIEW","Unmatched online room"],"related":["AIO-035","AIO-036","AIO-007"]} -->

**Answer:** A durable webhook receipt is not always an automatically allocated reservation. The event may require review because of unmatched rooms, unavailable units, invalid mapping or changes needing reconciliation.

**Where:** Owner Aiosell → Bookings needing attention; authorized diagnostics can inspect the property-scoped event. Confirm the booking reference, hotel/category, dates, action, latest event and issue.

**Recovery:** Use guided review to link an existing matching reservation or create after availability/duplicate checks. Modifications/cancellations require correcting actual stay/payment state first. Never create another booking just because a prior one is not visible in the first list searched. Provider “success” can mean receipt, not final allocation.

### AIO-035 | Should a withheld or invalid OTA phone number block a reservation?
<!-- faq: {"category":"aiosell","audience":["support-engineer","deployment-operator"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Phone number length does not match country code","Phone number null optional?","What phone number format?"],"related":["AIO-034","AIO-037"]} -->

**Answer:** Confirmed OTA inventory should not be blocked solely because the OTA withheld contact details. Migration 044 addresses the OTA optional-phone path; it does not globally disable direct-booking or web-check-in validation.

**Next:** Check the deployed migration/version and the event's current issue. Store valid supplied contact information; do not invent a phone number or globally accept malformed numbers to bypass an unrelated error. Direct/web-check-in flows retain their own applicable validation.

### AIO-036 | Should reservations, cancellations and no-shows update the channel manager?
<!-- faq: {"category":"aiosell","audience":["owner","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Stay view cancellation doesn't update Aiosell","Booking makes availability increase","Should no-show update Aiosell?"],"related":["AIO-013","AIO-014","AIO-034"]} -->

**Answer:** Changes affecting bookable allocations should be reflected in outbound availability when delivery is enabled/eligible. Cancellation/no-show and payment/refund handling are not the same operation. Confirm the actual local allocation/status first, then queue/delivery state and provider counts for the affected nights.

**Verification:** A pending reservation consuming a free unit should reduce that category's availability by one for occupied nights; checkout night is free. Release should restore only the relevant unit/nights. Multiple occupancy plans must not duplicate inventory. Group/extended stays require checking each applicable allocation.

**Limits:** Automatic updates off can leave external counts stale. OTA no-show reporting has a separate supported workflow and prerequisites; do not infer successful OTA no-show/refund reporting from an inventory push. Detailed refund/OTA commission policies are not established by this Aiosell FAQ.

### AIO-037 | Which scripts must I run, and do I redeploy for every price change?
<!-- faq: {"category":"aiosell","audience":["platform-admin","deployment-operator"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["What to do in Supabase?","Which migrations 044 045 046 047 048?","Every time redeploy?"],"related":["AIO-016","AIO-038","AIO-039"]} -->

**Answer:** Ordinary saved prices/operating settings do not require redeploying the application. Code/database changes do. Inspect the existing applied migrations and follow the release document, rather than rerunning all historical scripts.

**Order for this work:** Updated backward-compatible `aiosell-sync` worker as documented, missing migrations 044 → 045 → 046 → 047, then 048 for flat room pricing, then the appropriate frontend release. If 044–047 already succeeded, the flat-rate patch requires 048 plus frontend; no additional worker/secret/cron change is required solely for 048.

**Stop:** Do not rerun older migrations after newer ones; old definitions can overwrite fixes, including candidate hotel snapshot separation. Stop on SQL errors. Local build/tests do not deploy anything. Follow [DEPLOYMENT.md](../../docs/DEPLOYMENT.md), which is the command source of truth.

### AIO-038 | How are outbound credentials, webhook credentials and Supabase API access different?
<!-- faq: {"category":"aiosell","audience":["deployment-operator","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["No apikey request header found","Webhook credentials for Aiosell team","Does generating a new password change old secret?","Postman Invalid reservation payload"],"related":["AIO-032","AIO-034"]} -->

**Answer:** Outbound credentials authenticate Stayman to Aiosell. Inbound webhook Basic Auth authenticates Aiosell to Stayman. A human dashboard login is separate. Supabase's gateway/session headers are another layer; “No API key found” can occur before Aiosell is reached.

**Handling:** Keep managed secrets server-side. Generating a password locally does not rotate a deployed secret unless it is actually saved/deployed in the relevant configuration. If an old secret is unrecoverable, coordinate a deliberate rotation with the consumer; do not create multiple ambiguous active credentials or expose a service-role key in browser code.

**Testing:** Inspect the endpoint's actual authentication and payload contract with authorized synthetic data. “Invalid reservation payload” alone does not prove successful credential authentication or a created reservation; confirm the handler's processing order and durable event result. Do not send a live test booking without explicit authorization and a cleanup plan.

### AIO-039 | Why does “relation cron.job does not exist” appear?
<!-- faq: {"category":"aiosell","audience":["deployment-operator"],"status":"case-confirmed","last_reviewed":"2026-10-24","aliases":["42P01 cron.job","Both extensions enabled now what?","Scheduler setup unclear"],"related":["AIO-014","AIO-037"]} -->

**Answer:** In this setup the scheduler SQL was queried before the required cron extension was enabled. First inspect the selected Supabase project's extension state and the deployment instructions. The schedule also uses its required HTTP extension/configuration; verify those prerequisites instead of assuming an extension toggle creates the job.

**Next:** An authorized operator enables required extensions, installs/checks the intended schedule once, then verifies its job and execution results. Do not add duplicate jobs to repair an already running scheduler. Migration 046 updates the existing named job when present; it does not create a duplicate as a generic fix.

### AIO-040 | Booking.com warns that the property is available for only 89 more days. Is this the missing-price issue?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["Only available for 89 more days","Why not 365 days?","Dates beyond sync window"],"related":["AIO-024","AIO-028"]} -->

**Answer:** Stayman's current worker sends a rolling 90-day horizon. The displayed 89-day warning in this case was consistent with that scope, but a warning alone does not prove delivery for every included date.

**Meaning:** Missing prices or closures inside the active window need separate diagnosis. Outside-window availability/prices are not guaranteed by Stayman's current implementation. Do not promise that a room/site closure covers all future dates.

**Future work:** Extending the horizon needs an implementation/provider review, capacity/performance testing and a release, not merely hiding the OTA warning.

### AIO-041 | How do I verify the complete setup without creating more confusion?
<!-- faq: {"category":"aiosell","audience":["owner","platform-admin","support-engineer"],"status":"implementation-confirmed","last_reviewed":"2026-10-24","aliases":["How to check and verify everything in Stayman?","Everything looks OK but OTA wrong","End-to-end setup test"],"related":["AIO-024","AIO-028","AIO-029","AIO-036"]} -->

**Answer:** Use one representative future date and a small record of expected versus observed values across each stage. Stayman's settings are not a downstream OTA monitoring screen.

**Checklist:** Correct hotel and unique physical mappings; verified capacities/plan occupancies; prices per physical unit; no unresolved transition; approval/automatic-update settings; intended room/site permissions; revision-aware stage results; actual Aiosell availability and rates; actual Booking.com Standard Rate and bookability for the same date/occupancy.

**Controlled operation check:** After mapping/aggregation is verified, an authorized operator can use a controlled direct pending reservation on one free unit, verify one-unit reduction for its nights, then cancel/release it and verify restoration. Confirm local dates/status/allocations and provider results at each step. Do not use a checked-in stay as an assumed cancellable test, take a real OTA payment, erase reservation history or overstate success from the first HTTP response. See AIO-RUN-006.

## Implementation and evidence references

- Admin configuration and pending-proposal UI: `src/features/rooms/components/AiosellAdminSetup.jsx`.
- Owner switches, acknowledgements and booking review: `src/features/rooms/components/AiosellSettings.jsx`; adapter: `src/services/aiosellOwner.js`.
- Mapping validation/model: `src/services/aiosellMappings.js`.
- Pricing source and save/delivery behavior: `src/features/management/pages/PricingPage.jsx`, `src/features/admin/AdminPricing.jsx`, `src/features/management/components/AiosellPlanPrices.jsx`, `src/services/aiosellPricing.js`.
- API worker and stage outcomes: `supabase/functions/aiosell-sync/index.ts`.
- Schema/readiness/leases/sales rules: migrations `202610240045_aiosell_guided_mapping.sql`, `202610240046_aiosell_owner_operations.sql`, `202610240047_admin_workspace.sql`, `202610240048_aiosell_flat_room_rates.sql`; OTA phone patch `202610230044_ota_optional_phone.sql`.
- Local database regression evidence: `tests/aiosell-owner.test.mjs`, `tests/admin-workspace.test.mjs`, `tests/aiosell.test.mjs`; worker/mapping tests: `tests/aiosell-functions.test.mjs`, `tests/aiosell-mappings.test.mjs`.
- Release/capability details: [deployment](../../docs/DEPLOYMENT.md), [capability boundaries](../../docs/aiosell-capabilities.md). Recheck external documentation before changing an integration.
- Aiosell property details: https://apidocs.aiosell.com/api/property-details
- Aiosell restrictions: https://apidocs.aiosell.com/api/inventory-restrictions-push
- Booking.com inventory/rates/restrictions: https://developers.booking.com/connectivity/docs/b_xml-availability
- Booking.com pricing types: https://developers.booking.com/connectivity/docs/pricing-models

Provider links document capabilities; they are not evidence that a specific property's live configuration is correct. The final Booking.com issues from this incident remain unresolved in the supplied evidence.
