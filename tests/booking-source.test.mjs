import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {bookingSource} from '../src/services/bookingSource.js';
test('provider aliases use local assets while unknown/joint sources preserve their meaning',async()=>{
 for(const [input,label] of [[' BOOKING.COM ','Booking.com'],['Booking dot com','Booking.com'],['Agoda','Agoda'],['Airbnb','Airbnb'],['Expedia','Expedia'],['MMT','MakeMyTrip'],['Goibibo','Goibibo'],['Hostelworld','Hostelworld']]){
  const site=bookingSource(input);assert.equal(site.label,label);assert.equal(site.kind,'site');assert.ok(site.icon.startsWith('/images/booking-sites/'));await access(new URL('../public'+site.icon,import.meta.url));
 }
 assert.equal(bookingSource('Direct Booking').kind,'direct');assert.equal(bookingSource('Walk-in').label,'Walk-in');
 assert.equal(bookingSource(null).label,'Source not recorded');assert.equal(bookingSource('Unlisted travel agent').label,'Unlisted travel agent');
 assert.equal(bookingSource('GoMMT').icon,undefined,'joint channel must not be mislabeled as a specific brand');
 assert.equal(bookingSource('not booking.com').kind,'other','substring matches must not invent a provider');
});
