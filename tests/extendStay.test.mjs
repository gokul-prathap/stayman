import test from 'node:test';
import assert from 'node:assert/strict';
import {extendQuote} from '../src/features/reservations/utils/extendQuote.js';
test('extension preserves negotiated existing charges and recorded payments',()=>{
 const r={check_out_date:'2026-10-15',total_amount:123457,paid_amount:100000};
 assert.deepEqual(extendQuote(r,{nightlyRatePaise:50000},'2026-10-17'),{duration:2,extra:100000,newTotal:223457,balance:123457});
 assert.equal(r.total_amount,123457);
});
test('extension into another accommodation type charges only the added nights',()=>{
 assert.deepEqual(extendQuote({check_out_date:'2026-12-31',total_amount:400000,paid_amount:450000},{nightlyRatePaise:50000},'2027-01-01'),{duration:1,extra:50000,newTotal:450000,balance:0});
});
test('extension rejects nonlater checkout, invalid dates, missing rate and unsafe totals',()=>{
 const r={check_out_date:'2026-10-15',total_amount:100000,paid_amount:0};
 assert.throws(()=>extendQuote(r,{nightlyRatePaise:50000},'2026-10-15'));
 assert.throws(()=>extendQuote(r,{nightlyRatePaise:50000},'invalid'));
 assert.throws(()=>extendQuote(r,{},'2026-10-17'));
 assert.throws(()=>extendQuote({...r,total_amount:Number.MAX_SAFE_INTEGER},{nightlyRatePaise:50000},'2026-10-17'));
});
