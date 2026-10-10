import test from 'node:test';
import assert from 'node:assert/strict';
import {refundSummary,checkinProgress} from '../src/features/management/utils/guestOperations.js';
import {validateGuestDetails} from '../src/features/rooms/utils/guestCheckinValidation.js';
test('cancelled paid bookings remain pending until the full refund is returned',()=>{
 const r={id:'r',status:'CANCELLED',total_amount:100000,paid_amount:50000};
 assert.deepEqual(refundSummary(r),{done:0,pending:50000,status:'Pending'});
 const payments=[{reservation_id:'r',kind:'REFUND',amount_paise:20000}];
 assert.deepEqual(refundSummary({...r,paid_amount:30000},payments),{done:20000,pending:30000,status:'Pending'});
 assert.deepEqual(refundSummary({...r,paid_amount:0},[...payments,{reservation_id:'r',kind:'REFUND',amount_paise:30000}]),{done:50000,pending:0,status:'Done'});
});
test('active booking refund due uses overpayment, ignores other reservations and receipts',()=>{
 const r={id:'r',status:'CHECKED_IN',total_amount:60000,paid_amount:100000};
 assert.deepEqual(refundSummary(r,[{reservation_id:'other',kind:'REFUND',amount_paise:999},{reservation_id:'r',kind:'RECEIPT',amount_paise:100000}]),{done:0,pending:40000,status:'Pending'});
 assert.equal(refundSummary({...r,paid_amount:60000}).status,'Not required');
});
test('group progress is scoped to one booking and counts each completed person',()=>{
 const members=[{reservation_id:'r',status:'completed'},{reservation_id:'r',status:'draft'},{reservation_id:'other',status:'completed'}];
 assert.deepEqual(checkinProgress(members,'r'),{total:2,done:1});
 assert.deepEqual(checkinProgress(members,'missing'),{total:0,done:0});
});
test('linked bookings can validate booked arrival while public check-in rejects historical dates',()=>{
 const details={full_name:'Anand Guest',email:'guest@example.com',phone:'+919876543210',arrival_date:'2026-10-09',departure_date:'2026-10-12',coming_from:'Delhi',going_to:'Goa',foreign_guest:false};
 assert.throws(()=>validateGuestDetails(details,'2026-10-10'),/before today/);
 assert.equal(validateGuestDetails(details,details.arrival_date).arrival_date,'2026-10-09');
});
