-- READ ONLY. For an authorized operator in the selected Supabase project.
-- Replace YOUR_PROPERTY_UUID in the query you need. Run one query at a time.
-- Do not paste service keys, credentials or full guest payloads into support messages.

-- 1. Association and independent operating state.
select p.name,c.hotel_code,c.enabled,c.approved,c.setup_verified,c.auto_sync,
 c.manual_pending,c.pending_scope,c.revision,c.synced_revision,c.retry_at,
 c.lease_until,c.last_error,public.stayman_aiosell_ready(c.property_id) as ready,
 exists(select 1 from public.stayman_aiosell_transitions t where t.property_id=c.property_id) as transition_pending
from public.stayman_properties p join public.stayman_aiosell_connections c on c.property_id=p.id
where p.id='YOUR_PROPERTY_UUID'::uuid;

-- 2. Small per-stage result, avoiding large inventory traces.
select c.last_sync_results->>'revision' as result_revision,
 c.last_sync_results->'stages'->'inventory'->>'status' as inventory_status,
 c.last_sync_results->'stages'->'rates'->>'status' as rates_status,
 c.last_sync_results->'stages'->'restrictions'->>'status' as restrictions_status,
 c.last_error,c.last_synced_at
from public.stayman_aiosell_connections c where c.property_id='YOUR_PROPERTY_UUID'::uuid;

-- 3. Desired and accepted room sales state; true stopSell means closed.
select m->>'roomCode' as category,m->>'roomName' as name,
 m->'unitIds' as physical_units,m->>'stopSell' as sales_closed,
 c.sales_ack->>(m->>'mappingId') as last_accepted_open
from public.stayman_aiosell_connections c cross join lateral jsonb_array_elements(c.mappings) m
where c.property_id='YOUR_PROPERTY_UUID'::uuid;

-- 4. Current resolved prices/rules. Amounts are paise, not rupees.
select m->>'roomCode' as category,m->>'ratePaise' as price_paise,
 m->>'priceError' as price_problem,m->'guestPricing' as guest_rules,m->'ratePlans' as plans
from jsonb_array_elements(public.stayman_aiosell_resolved_rates('YOUR_PROPERTY_UUID'::uuid)) m;

-- 5. Pending proposal: final apply uses these values, not arbitrary later form edits.
select t.old_hotel,t.hotel as proposed_hotel,t.closure_revision,
 m->>'roomCode' as category,m->'unitIds' as physical_units,
 m->'guestPricing' as proposed_guest_rules,m->'ratePlans' as proposed_plans
from public.stayman_aiosell_transitions t cross join lateral jsonb_array_elements(t.mappings) m
where t.property_id='YOUR_PROPERTY_UUID'::uuid;

-- 6. Verified saved-hotel capacities/occupancy; candidate previews do not replace it after 047.
select r.hotel_code,r.checked_at,room->>'room_id' as category,
 room->>'max_occ' as remote_capacity,room->'rateplans' as remote_plans
from public.stayman_aiosell_remote r
join public.stayman_aiosell_connections c using(property_id,hotel_code)
cross join lateral jsonb_array_elements(r.details->'rooms') room
where r.property_id='YOUR_PROPERTY_UUID'::uuid;

-- 7. Supported site controls. These records do not prove OTA provisioning or live bookability.
select name,target,verified,desired_open,ack_open,accepted_at
from public.stayman_aiosell_sites where property_id='YOUR_PROPERTY_UUID'::uuid;

-- 8. Count booking links and event states without exposing guest identities/payloads.
select (select count(*) from public.stayman_aiosell_bookings where property_id='YOUR_PROPERTY_UUID'::uuid) as booking_links,
 (select count(*) from public.stayman_aiosell_events where property_id='YOUR_PROPERTY_UUID'::uuid and status='REVIEW') as review_events;

-- No deletes, resets, extensions, schedule creation or schema changes belong in this file.
