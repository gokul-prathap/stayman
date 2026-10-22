-- READ ONLY. Run in Supabase SQL Editor. No secrets or guest information returned.
-- Query 1: stored mapping IDs, actual units and local prices.
select p.name property_name,c.property_id,c.hotel_code,c.enabled,c.revision,c.synced_revision,
 c.last_sync_results,c.last_error,m->>'roomCode' room_code,m->>'rateplanCode' rateplan_code,
 jsonb_array_length(m->'unitIds') selected_unit_count,
 coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'room',u.room_name,'unit',u.label,
   'type',u.unit_type,'price',u.nightly_rate_paise/100.0,'archived',u.archived_at is not null) order by u.room_name,u.label)
  from public.stayman_units u where u.property_id=c.property_id
  and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))),'[]'::jsonb) units
from public.stayman_aiosell_connections c join public.stayman_properties p on p.id=c.property_id
cross join lateral jsonb_array_elements(c.mappings) m
order by p.name,m->>'roomCode';

-- Query 2: expected outbound availability for the next 14 nights, by category.
-- A valid result can NEVER exceed the selected active units in that mapping.
select p.name property_name,c.hotel_code,m->>'roomCode' room_code,d::date night,
 (select count(*) from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null
   and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))) active_mapped_units,
 case when (m->>'stopSell')::boolean or exists(select 1 from public.stayman_aiosell_events e where e.property_id=c.property_id and e.status='REVIEW') then 0 else
  (select count(*) from public.stayman_units u where u.property_id=c.property_id and u.archived_at is null
   and u.id in(select value::uuid from jsonb_array_elements_text(m->'unitIds'))
   and not exists(select 1 from public.stayman_allocations a where a.unit_id=u.id and a.check_in_date<=d::date and a.check_out_date>d::date)) end expected_available
from public.stayman_aiosell_connections c join public.stayman_properties p on p.id=c.property_id
cross join lateral jsonb_array_elements(c.mappings) m
cross join lateral generate_series((now() at time zone coalesce(p.timezone,'Asia/Kolkata'))::date::timestamp,
 ((now() at time zone coalesce(p.timezone,'Asia/Kolkata'))::date+13)::timestamp,interval '1 day') d
order by p.name,m->>'roomCode',d;

-- Query 3: has the deployed claim function retained migration 029's Pricing link?
select coalesce(pg_get_functiondef(to_regprocedure('public.stayman_aiosell_claim(uuid)')) like '%stayman_aiosell_resolved_rates%',false) claim_follows_pricing,
 to_regprocedure('public.stayman_aiosell_pricing_status(uuid)') is not null pricing_status_installed;
