import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingCheckinState} from '../src/features/reservations/utils/bookingCheckinState.js';
import {mergeCheckinStatuses} from '../src/services/propertyData.js';

const reservation={id:'booking',guest_id:'contact'};
test('completed submission linked to booking remains done when guest_id is null',()=>{
 const state=bookingCheckinState([{id:'member',reservation_id:'booking',guest_id:null,status:'completed'}],reservation);
 assert.equal(state.done,1);assert.equal(state.total,1);assert.equal(state.allComplete,true);
 assert.equal(state.contactCompleted,false);assert.equal(state.contactMember,null);
});
test('only explicitly linked contact controls contact completion; names do not establish identity',()=>{
 const state=bookingCheckinState([{reservation_id:'booking',guest_id:null,display_name:'Same Name',status:'completed'},{reservation_id:'booking',guest_id:'contact',status:'draft'}],reservation);
 assert.equal(state.done,1);assert.equal(state.total,2);assert.equal(state.allComplete,false);assert.equal(state.contactCompleted,false);
});
test('completed contact stays locked while another guest still needs to submit',()=>{
 const state=bookingCheckinState([{reservation_id:'booking',guest_id:'contact',status:'completed'},{reservation_id:'booking',guest_id:null,status:'draft'},{reservation_id:'other',guest_id:'contact',status:'completed'}],reservation);
 assert.equal(state.contactCompleted,true);assert.equal(state.allComplete,false);assert.equal(state.total,2);
});
test('empty bookings and drafts are not completed; explicit binding preserves completion',()=>{
 assert.equal(bookingCheckinState([],reservation).allComplete,false);
 assert.equal(bookingCheckinState([{reservation_id:'booking',guest_id:'contact',status:'draft'}],reservation).allComplete,false);
 const state=bookingCheckinState([{reservation_id:'booking',guest_id:'contact',status:'completed'}],reservation);
 assert.equal(state.contactCompleted,true);assert.equal(state.allComplete,true);
});
test('fresh detail status updates cached lists without copying submitted identity details',()=>{
 const cached={members:[{id:'m',reservation_id:'booking',status:'draft',guest_id:null}]};
 const detail={members:[{id:'m',reservation_id:'booking',status:'completed',guest_id:null,details:{private:'not for list caches'}}]};
 const updated=mergeCheckinStatuses(cached,detail);
 assert.equal(updated.members[0].status,'completed');assert.equal(updated.members[0].details,undefined);
 assert.equal(cached.members[0].status,'draft');assert.equal(mergeCheckinStatuses(updated,detail),updated);
 assert.equal(mergeCheckinStatuses(cached,{members:[{...detail.members[0],reservation_id:'another'}]}),cached);
});
