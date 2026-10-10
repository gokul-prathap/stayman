import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBookingStatus,destinationError,chargeBetween,transferQuote} from '../src/features/reservations/utils/bookingActions.js';
const reservation={id:'r',total_amount:100001,paid_amount:90000,check_in_date:'2026-10-10',check_out_date:'2026-10-13'};
const stay={id:'a',reservationDbId:'r',unitId:'private',checkInDate:'2026-10-10',checkOutDate:'2026-10-13',chargePaise:100001};
const dorm={id:'dorm',type:'BED',genderPolicy:'ANY',nightlyRatePaise:20000};
test('walk-ins today are checked in; advance reservations stay pending',()=>{
 assert.equal(defaultBookingStatus('2026-10-10','2026-10-10'),'CHECKED_IN');
 assert.equal(defaultBookingStatus('2026-10-11','2026-10-10'),'PENDING');
});
test('private to dorm repricing preserves receipts and exposes refund due',()=>{
 const q=transferQuote(reservation,dorm,[stay],'2026-10-10','2026-10-13');
 assert.equal(q.newTotal,60000);assert.equal(q.paid,90000);assert.equal(q.refund,30000);assert.equal(q.due,0);
});
test('one-night move preserves surrounding charges and exact paise',()=>{
 const charges=['2026-10-10','2026-10-11','2026-10-12'].map((d,i)=>chargeBetween(stay,d,['2026-10-11','2026-10-12','2026-10-13'][i]));
 assert.deepEqual(charges,[33333,33334,33334]);assert.equal(charges.reduce((s,v)=>s+v,0),100001);
 const q=transferQuote(reservation,dorm,[stay],'2026-10-11','2026-10-12');
 assert.equal(q.newTotal,86667);assert.equal(q.refund,3333);
});
test('move across several split allocations replaces only selected nights',()=>{
 const parts=[{...stay,checkOutDate:'2026-10-11',chargePaise:30000},{...stay,id:'b',unitId:'other',checkInDate:'2026-10-11',chargePaise:70001}];
 assert.equal(transferQuote(reservation,dorm,parts,'2026-10-10','2026-10-12').newTotal,75001);
 assert.throws(()=>transferQuote(reservation,dorm,[parts[0]],'2026-10-10','2026-10-13'),/no bed allocation/);
 assert.throws(()=>transferQuote(reservation,{...dorm,id:'private'},[stay],'2026-10-10','2026-10-13'),/different/);
});
test('availability includes cross-type rooms, blocks conflicts and respects gender policy',()=>{
 assert.equal(destinationError(dorm,{gender:'MALE'},[stay],'r','2026-10-10','2026-10-13'),'');
 assert.match(destinationError(dorm,{},[{unitId:'dorm',reservationDbId:null,checkInDate:'2026-10-10',checkOutDate:'2026-10-11'}],null,'2026-10-10','2026-10-13'),/Occupied/);
 assert.match(destinationError({...dorm,genderPolicy:'FEMALE_ONLY'},{gender:'MALE'},[],'r','2026-10-10','2026-10-13'),/gender/);
 assert.equal(destinationError({...dorm,genderPolicy:'FEMALE_ONLY'},null,[],null,'2026-10-10','2026-10-13'),'');
});
