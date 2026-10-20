import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLine} from '../src/features/billing/billingMath.js';
test('inclusive sample reconciles separately rounded components with an explicit one-paisa adjustment',()=>{
 assert.deepEqual(calculateLine(78645,{cgst_bps:250,sgst_bps:250}),{taxable:74900,cgst:1873,sgst:1873,igst:0,adjustment:-1,total:78645});
});
test('exclusive charges add separately rounded taxes without hidden adjustments',()=>{
 assert.equal(calculateLine(74900,{cgst_bps:250,sgst_bps:250},'EXCLUSIVE').total,78646);
});
test('no-tax amounts remain exact and IGST does not mix with central/state tax',()=>{
 assert.equal(calculateLine(12345).total,12345);assert.equal(calculateLine(11800,{igst_bps:1800}).taxable,10000);
 assert.throws(()=>calculateLine(10000,{igst_bps:1800,cgst_bps:900}));
});
test('money calculations reject negative, fractional, unsafe or misconfigured values',()=>{
 for(const amount of [-1,.5,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>calculateLine(amount));
 assert.throws(()=>calculateLine(100,{cgst_bps:-1}));assert.throws(()=>calculateLine(100,{},'UNKNOWN'));
});
