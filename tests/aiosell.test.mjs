import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeReservation, basicMatches, aiosellRequest} from '../supabase/functions/_shared/aiosell.mjs';
import {createWorkspaceFixture, property, rpc} from '../qa/workspace-fixture.mjs';

const booking = () => ({action: 'book', hotelCode: 'sandbox-pms', channel: 'test-ota', bookingId: 'SYNTHETIC-1', checkin: '2027-01-01', checkout: '2027-01-03', amount: {currency: 'INR', amountAfterTax: 1234.56}, rooms: [{roomCode: 'suite', rateplanCode: 'suite-ep'}]});
test('reservation normalizer accepts withheld guest data and drops all card fields', () => {
  const payload = normalizeReservation({...booking(), creditCard: {cvv: 'never-save'}, untrusted: 'ignore'});
  assert.equal(payload.totalPaise, 123456); assert.equal(payload.guest.phone, null); assert.equal(payload.guest.name, 'OTA guest');
  assert.equal(payload.creditCard, undefined); assert.equal(payload.untrusted, undefined);
  assert.deepEqual(normalizeReservation({action: 'cancel', hotelCode: 'h', channel: 'c', bookingId: 'b', creditCard: {}}), {action: 'cancel', hotelCode: 'h', channel: 'c', bookingId: 'b'});
});
test('rejects invalid dates, currencies and inventory', () => {
  for (const change of [{checkin: '2027-02-30'}, {checkout: '2026-01-01'}, {amount: {currency: 'USD', amountAfterTax: 4}}, {rooms: []}]) assert.throws(() => normalizeReservation({...booking(), ...change}));
});
test('webhook auth fails closed', async () => {
  assert.equal(await basicMatches('Basic ' + btoa('user:secret'), 'user', 'secret'), true);
  assert.equal(await basicMatches('Basic ' + btoa('user:wrong'), 'user', 'secret'), false);
  assert.equal(await basicMatches(null, null, null), false);
});
test('outbound API validates HTTP and business failure and never follows redirects', async () => {
  const env = key => ({AIOSELL_API_USERNAME: 'synthetic', AIOSELL_API_PASSWORD: 'synthetic'}[key]);
  await assert.rejects(aiosellRequest('/update/sample-pms', {}, env, async (url, options) => {assert.equal(options.redirect, 'error'); return new Response('{"success":false}');}), /rejected/);
  await assert.rejects(aiosellRequest('/update/sample-pms', {}, env, async () => new Response('{}', {status: 429})), /429/);
});
test('database mapping, durable webhook, duplicate handling, review stop-sell and leases', async () => {
  const db = await createWorkspaceFixture(0);
  try {
    await db.exec(`create role service_role; alter table stayman_guests alter id set default gen_random_uuid(); alter table stayman_reservations alter id set default gen_random_uuid(); alter table stayman_allocations alter id set default gen_random_uuid();
      alter table stayman_reservations add source text default 'Direct Booking'; alter table stayman_reservations add notes text default ''; alter table stayman_reservations alter status set default 'PENDING'; alter table stayman_reservations alter paid_amount set default 0;`);
    const migration = await readFile(new URL('../supabase/migrations/202610220027_aiosell_channel_manager.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration); // SQL Editor reruns must be safe.
    const resultsMigration = await readFile(new URL('../supabase/migrations/202610220028_aiosell_sync_results.sql', import.meta.url), 'utf8');
    await db.exec(resultsMigration); await db.exec(resultsMigration);
    const pricingMigration = await readFile(new URL('../supabase/migrations/202610220029_aiosell_follow_pricing.sql', import.meta.url), 'utf8');
    await db.exec(pricingMigration); await db.exec(pricingMigration);
    const management = await readFile(new URL('../supabase/migrations/202610100007_management.sql', import.meta.url), 'utf8');
    const rateStart = management.indexOf('create function public.stayman_save_rates(');
    await db.exec(management.slice(rateStart, management.indexOf('end $$;', rateStart) + 'end $$;'.length));
    const units = (await db.query('select id from stayman_units order by id limit 2')).rows.map(x => x.id);
    const mappings = [{roomCode: 'suite', rateplanCode: 'suite-ep', unitIds: units, ratePaise: 61728, stopSell: false, minimumStay: 1}];
    await rpc(db, 'stayman_aiosell_save', {p_property: property, p_hotel: 'sandbox-pms', p_enabled: true, p_mappings: mappings});
    await db.exec("set qa.allowed='no'");
    await assert.rejects(rpc(db, 'stayman_aiosell_settings', {p_property: property}), /Owner/);
    await db.exec("set qa.allowed='yes'");
    const payload = normalizeReservation(booking());
    assert.equal((await rpc(db, 'stayman_aiosell_receive', {p_payload: payload})).success, true);
    await rpc(db, 'stayman_aiosell_receive', {p_payload: payload});
    assert.equal((await db.query('select count(*)::int n from stayman_reservations')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from stayman_aiosell_events')).rows[0].n, 1);
    const job = await rpc(db, 'stayman_aiosell_claim', {p_property: property});
    assert.equal(job.mappings[0].ratePaise, 50000); // Follows local price, ignores former explicit channel price.
    await assert.rejects(rpc(db, 'stayman_aiosell_channels', {p_property: property, p_channels: ['invalid target!']}), /Invalid/);
    assert.equal(job.updates.length, 90); assert.equal(job.updates[0].rooms[0].available, 2);
    const arrival = job.updates.find(day => day.startDate === '2027-01-01');
    if (arrival) {assert.equal(arrival.rooms[0].available, 1); assert.equal(job.updates.find(day => day.startDate === '2027-01-03').rooms[0].available, 2);}
    assert.equal(await rpc(db, 'stayman_aiosell_claim', {p_property: property}), null);
    await rpc(db, 'stayman_aiosell_finish_result', {p_property: property, p_lease: '00000000-0000-0000-0000-000000000099', p_revision: job.revision, p_results: {inventory: {status: 'sent'}}});
    assert.equal((await rpc(db, 'stayman_aiosell_settings', {p_property: property})).connection.last_sync_results, null);
    // A change during a request must remain dirty after the older revision completes.
    await rpc(db, 'stayman_aiosell_save', {p_property: property, p_hotel: 'sandbox-pms', p_enabled: true, p_mappings: mappings});
    await rpc(db, 'stayman_aiosell_finish', {p_property: property, p_lease: job.lease, p_revision: job.revision});
    const next = await rpc(db, 'stayman_aiosell_claim', {p_property: property}); assert.ok(next.revision > job.revision);
    await rpc(db, 'stayman_aiosell_finish', {p_property: property, p_lease: next.lease, p_revision: next.revision});
    await rpc(db, 'stayman_aiosell_receive', {p_payload: {...payload, action: 'modify'}});
    const blocked = await rpc(db, 'stayman_aiosell_claim', {p_property: property}); assert.equal(blocked.blocked, true); assert.equal(blocked.updates[0].rooms[0].available, 0);
    const reservation = (await db.query('select id from stayman_reservations')).rows[0].id;
    const event = (await db.query("select id from stayman_aiosell_events where status='REVIEW'")).rows[0].id;
    await rpc(db, 'stayman_aiosell_resolve', {p_event: event, p_reservation: reservation});
    await rpc(db, 'stayman_aiosell_receive', {p_payload: normalizeReservation({...booking(), action: 'cancel'})});
    assert.equal((await db.query('select status from stayman_reservations')).rows[0].status, 'CANCELLED');
    assert.equal((await db.query('select count(*)::int n from stayman_allocations')).rows[0].n, 0);
    assert.equal((await db.query("select has_function_privilege('authenticated','stayman_aiosell_receive(jsonb)','execute') allowed")).rows[0].allowed, false);
    // Unmapped arrivals are retained, with no partial guest/reservation insert.
    await rpc(db, 'stayman_aiosell_receive', {p_payload: {...payload, bookingId: 'UNMAPPED', rooms: [{roomCode: 'unknown', rateplanCode: 'unknown'}]}});
    assert.equal((await db.query('select count(*)::int n from stayman_reservations')).rows[0].n, 1);
    const twoRooms = {...payload, bookingId: 'TWO-ROOMS', totalPaise: 123457, rooms: [payload.rooms[0], payload.rooms[0]]};
    await rpc(db, 'stayman_aiosell_receive', {p_payload: twoRooms});
    assert.equal((await db.query('select sum(charge_paise)::int total from stayman_allocations')).rows[0].total, 123457);
    assert.equal((await db.query('select count(distinct unit_id)::int n from stayman_allocations')).rows[0].n, 2);
    await rpc(db, 'stayman_aiosell_receive', {p_payload: {...twoRooms, bookingId: 'OVERBOOK'}});
    assert.equal((await db.query('select count(*)::int n from stayman_reservations')).rows[0].n, 2);
    assert.equal((await db.query("select status from stayman_aiosell_events where booking_id='OVERBOOK'")).rows[0].status, 'REVIEW');
    const partial = {inventory: {status: 'sent'}, rates: {status: 'sent'}, restrictions: {status: 'pending'}};
    await rpc(db, 'stayman_aiosell_finish_result', {p_property: property, p_lease: blocked.lease, p_revision: blocked.revision, p_results: partial, p_error: 'Restriction targets pending.'});
    const status = (await rpc(db, 'stayman_aiosell_settings', {p_property: property})).connection;
    assert.deepEqual(status.last_sync_results.stages, partial);
    assert.ok(status.revision > status.synced_revision); assert.equal(status.last_error, 'Restriction targets pending.');
    assert.equal(await rpc(db, 'stayman_aiosell_claim', {p_property: property}), null);
    await rpc(db, 'stayman_aiosell_channels', {p_property: property, p_channels: ['confirmed-test-target']});
    assert.deepEqual((await rpc(db, 'stayman_aiosell_settings', {p_property: property})).connection.restriction_channels, ['confirmed-test-target']);
    const beds = (await db.query('select id from stayman_units where not(id=any($1::uuid[])) order by id limit 2',[units])).rows.map(x => x.id);
    await db.query("update stayman_units set unit_type='ROOM' where id=any($1::uuid[])",[units]);
    const categories = [{...mappings[0], unitIds: units}, {...mappings[0], roomCode: 'executive', rateplanCode: 'executive-ep', unitIds: beds}];
    await rpc(db, 'stayman_aiosell_save', {p_property: property, p_hotel: 'sandbox-pms', p_enabled: true, p_mappings: categories});
    await rpc(db, 'stayman_save_rates', {p_property: property, p_rates: [...units.map(unitId => ({unitId,ratePaise:120000})), ...beds.map(unitId => ({unitId,ratePaise:60000}))]});
    await db.exec("update stayman_aiosell_events set status='APPLIED',issue='Synthetic fixture: start independent booking scenario' where status='REVIEW'");
    // A Stay View booking total of 5000 must never become the nightly channel rate.
    const reservationsSql = await readFile(new URL('../supabase/migrations/202610100006_stayman_reservations.sql', import.meta.url),'utf8');
    const bookingStart = reservationsSql.indexOf('create function public.stayman_create_booking(');
    await db.exec(reservationsSql.slice(bookingStart,reservationsSql.indexOf('end $$;',bookingStart)+'end $$;'.length));
    const dates = (await db.query("select (current_date+2)::text arrive,(current_date+4)::text depart")).rows[0];
    await rpc(db,'stayman_create_booking',{p_unit:units[0],p_details:{guestName:'Synthetic booking test',phone:'+919876543210',checkInDate:dates.arrive,checkOutDate:dates.depart,totalAmountPaise:500000,paidAmountPaise:0,gender:'OTHER'}});
    assert.equal((await rpc(db, 'stayman_aiosell_pricing_status', {p_property: property})).status, 'pending');
    const priced = await rpc(db, 'stayman_aiosell_claim', {p_property: property});
    assert.equal(priced.mappings.find(m=>m.roomCode==='suite').ratePaise, 120000);
    assert.equal(priced.mappings.find(m=>m.roomCode==='executive').ratePaise, 60000);
    assert.equal(priced.updates.find(day=>day.startDate===dates.arrive).rooms.find(room=>room.roomCode==='suite').available,1);
    assert.ok(priced.updates.every(day=>day.rooms.every(room=>room.available<=2)));
    await db.exec(await readFile(new URL('../docs/aiosell-diagnostics.sql',import.meta.url),'utf8'));
    await rpc(db, 'stayman_aiosell_finish_result', {p_property: property, p_lease: priced.lease, p_revision: priced.revision, p_results: {rates:{status:'sent'},restrictions:{status:'pending'}}, p_error:'Restrictions pending.'});
    assert.equal((await rpc(db, 'stayman_aiosell_pricing_status', {p_property: property})).status, 'sent');
    await rpc(db, 'stayman_save_rates', {p_property: property, p_rates: [{unitId:units[0],ratePaise:130000}]});
    assert.equal((await rpc(db, 'stayman_aiosell_pricing_status', {p_property: property})).status, 'pending');
    const conflict = await rpc(db, 'stayman_aiosell_claim', {p_property: property});
    assert.equal(conflict.mappings[0].ratePaise, null); assert.match(conflict.mappings[0].priceError, /different prices/);
    await rpc(db,'stayman_aiosell_finish_result',{p_property:property,p_lease:conflict.lease,p_revision:conflict.revision,p_results:{inventory:{status:'sent'},rates:{status:'failed'}},p_error:'Rate conflict.'});
    const pauseMigration=await readFile(new URL('../supabase/migrations/202610220030_aiosell_pause_after_inventory_closure.sql',import.meta.url),'utf8');
    await db.exec(pauseMigration); await db.exec(pauseMigration);
    await assert.rejects(rpc(db,'stayman_aiosell_save',{p_property:property,p_hotel:'sandbox-pms',p_enabled:false,p_mappings:categories}),/Stop sell/);
    const closedCategories=categories.map(m=>({...m,stopSell:true}));
    await rpc(db,'stayman_aiosell_save',{p_property:property,p_hotel:'sandbox-pms',p_enabled:true,p_mappings:closedCategories});
    await assert.rejects(rpc(db,'stayman_aiosell_save',{p_property:property,p_hotel:'sandbox-pms',p_enabled:false,p_mappings:closedCategories}),/Stop sell/);
    const closure=await rpc(db,'stayman_aiosell_claim',{p_property:property});
    assert.ok(closure.updates.every(day=>day.rooms.every(room=>room.available===0)));
    await rpc(db,'stayman_aiosell_finish_result',{p_property:property,p_lease:closure.lease,p_revision:closure.revision,p_results:{inventory:{status:'sent'},rates:{status:'failed'},restrictions:{status:'pending'}},p_error:'Rates conflict; restriction targets pending.'});
    await rpc(db,'stayman_aiosell_save',{p_property:property,p_hotel:'sandbox-pms',p_enabled:false,p_mappings:closedCategories});
    await rpc(db,'stayman_aiosell_save',{p_property:property,p_hotel:'sandbox-pms',p_enabled:false,p_mappings:[closedCategories[0]]});
    assert.equal((await rpc(db,'stayman_aiosell_settings',{p_property:property})).connection.mappings.length,1);
    assert.equal((await db.query("select total_amount::int total from stayman_reservations where id=(select reservation_id from stayman_aiosell_bookings where booking_id='TWO-ROOMS')")).rows[0].total,123457);
    await db.exec("set qa.allowed='no'");
    await assert.rejects(rpc(db, 'stayman_aiosell_pricing_status', {p_property: property}), /Owner/);
    assert.equal((await db.query("select has_function_privilege('authenticated','stayman_aiosell_claim_inventory(uuid)','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
