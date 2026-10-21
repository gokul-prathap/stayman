import test from 'node:test';
import assert from 'node:assert/strict';
import {draggedDeparture,extensionPlan} from '../src/features/allocation/utils/stayExtension.js';
const stay={id:'a',reservationDbId:'r',unitId:'u',checkInDate:'2026-10-21',checkOutDate:'2026-10-23'};
const data={units:[{id:'u',nightlyRatePaise:50000}],guests:[],reservations:[{id:'r',status:'PENDING',check_out_date:'2026-10-23',total_amount:100000,paid_amount:40000}],allocations:[stay]};
test('mouse and touch distances snap to complete nights without shortening',()=>{
 assert.equal(draggedDeparture('2026-10-23',120,60),'2026-10-25');
 assert.equal(draggedDeparture('2026-10-23',-120,60),'2026-10-23');
 assert.equal(draggedDeparture('2026-10-31',60,60),'2026-11-01');
});
test('extension retains existing payments and charges only added nights',()=>{
 const plan=extensionPlan(data,stay,'2026-10-25','2026-10-21');
 assert.equal(plan.quote.duration,2);assert.equal(plan.quote.extra,100000);assert.equal(plan.quote.newTotal,200000);assert.equal(plan.quote.balance,160000);
});
test('occupied nights and maintenance block an extension; checkout boundary is free',()=>{
 for(const status of ['MAINTENANCE','CONFIRMED']){
  const conflict={...stay,id:'b',reservationDbId:'other',checkInDate:'2026-10-24',checkOutDate:'2026-10-26',status};
  assert.throws(()=>extensionPlan({...data,allocations:[stay,conflict]},stay,'2026-10-25','2026-10-21'),/Occupied|Maintenance/);
  assert.equal(extensionPlan({...data,allocations:[stay,conflict]},stay,'2026-10-24','2026-10-21').quote.duration,1);
 }
});
test('cancelled, departed and intermediate allocation segments cannot be extended',()=>{
 for(const status of ['CANCELLED','CHECKED_OUT'])assert.throws(()=>extensionPlan({...data,reservations:[{...data.reservations[0],status}]},stay,'2026-10-25','2026-10-21'),/active/);
 assert.throws(()=>extensionPlan(data,{...stay,checkOutDate:'2026-10-22'},'2026-10-25','2026-10-21'),/final night/);
 assert.throws(()=>extensionPlan(data,stay,'2026-10-25','2026-10-24'),/active/);
});

test('maintenance drag extends the existing block and rejects conflicting nights',()=>{
 const block={...stay,status:'MAINTENANCE',reason:'Repairs'};
 const blocks={...data,allocations:[block]};
 const plan=extensionPlan(blocks,block,'2026-10-25','2026-10-21');
 assert.equal(plan.maintenance,true);assert.equal(plan.allocation.id,block.id);
 assert.throws(()=>extensionPlan({...blocks,allocations:[block,{...stay,id:'next',checkInDate:'2026-10-24',checkOutDate:'2026-10-26'}]},block,'2026-10-25','2026-10-21'),/Occupied/);
 assert.throws(()=>extensionPlan(blocks,block,'2026-10-23','2026-10-21'),/later/);
 assert.throws(()=>extensionPlan(blocks,block,'2028-10-25','2026-10-21'),/366/);
});
