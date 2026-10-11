import test from 'node:test';
import assert from 'node:assert/strict';
import {previewMovement,stockTotal,actionsFor,expenseSummary} from '../src/features/management/utils/operations.js';
const linen={kind:'LINEN',clean:10,in_use:3,dirty:2,laundry:5};
test('linen lifecycle conserves owned pieces through issue, collection, wash and return',()=>{
 let item={...linen};
 for(const action of ['ISSUE','DIRTY','SEND_LAUNDRY','RETURN']) {
  item=previewMovement(item,action,2);assert.equal(stockTotal(item),20);
 }
 assert.deepEqual(item,linen);
});
test('receiving increases stock; discarding reduces stock; opening dirty stock is supported',()=>{
 const received=previewMovement(linen,'RECEIVE_DIRTY',4);
 assert.equal(received.dirty,6);assert.equal(stockTotal(received),24);
 assert.equal(stockTotal(previewMovement(received,'DISCARD_DIRTY',3)),21);
});
test('stock rejects overspending, fractional linen, wrong-kind actions and invalid precision',()=>{
 for(const [action,q] of [['ISSUE',11],['RETURN',6],['DIRTY',.5],['RECEIVE',0],['RECEIVE',-1],['RECEIVE',Infinity],['CONSUME',1]]) assert.throws(()=>previewMovement(linen,action,q));
 const supply={kind:'SUPPLY',clean:1.5,in_use:0,dirty:0,laundry:0};
 assert.equal(previewMovement(supply,'CONSUME',.3).clean,1.2);
 assert.throws(()=>previewMovement(supply,'ISSUE',1));assert.throws(()=>previewMovement(supply,'RECEIVE',.001));
 assert.deepEqual(actionsFor(supply).map(([key])=>key),['RECEIVE','CONSUME']);
});
test('expense accrual and cash use different dates, excluding voids and future bills from outstanding',()=>{
 const expenses=[
  {category:'ELECTRICITY',amount_paise:10000,expense_date:'2026-10-01',paid_date:'2026-10-11',units_consumed:25},
  {category:'LAUNDRY',amount_paise:2000,expense_date:'2026-10-11',paid_date:null},
  {category:'CLEANING',amount_paise:3000,expense_date:'2026-10-11',paid_date:'2026-10-12'},
  {category:'SUPPLIES',amount_paise:4000,expense_date:'2026-10-11',voided_at:'2026-10-11'},
  {category:'OTHER',amount_paise:5000,expense_date:'2026-10-12',paid_date:null},
  {category:'RENT',amount_paise:6000,expense_date:'2026-09-01',paid_date:null},
 ];
 assert.deepEqual(expenseSummary(expenses,'2026-10-11','2026-10-11'),{incurred:5000,paid:10000,unpaid:8000,units:0});
 assert.equal(expenseSummary(expenses,'2026-10-01','2026-10-11').units,25);
 assert.deepEqual(expenseSummary([], '2026-10-01','2026-10-11'),{incurred:0,paid:0,unpaid:0,units:0});
});
