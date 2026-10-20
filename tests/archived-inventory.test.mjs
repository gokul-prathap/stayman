import test from 'node:test';
import assert from 'node:assert/strict';
import {reportMetrics} from '../src/features/management/utils/metrics.js';
test('archived units retain historical occupancy but stop contributing current capacity',()=>{
 const active={id:'active'},archived={id:'old',archivedAt:'2026-10-20T08:00:00Z'};
 const data={units:[active],allUnits:[active,archived],reservations:[{id:'booking',status:'CHECKED_OUT',check_in_date:'2026-10-19',check_out_date:'2026-10-20',total_amount:50000}],allocations:[{unitId:'old',reservationDbId:'booking',checkInDate:'2026-10-19',checkOutDate:'2026-10-20',status:'CHECKED_IN',chargePaise:50000}],payments:[]};
 const report=reportMetrics(data,'2026-10-19','2026-10-20');
 assert.equal(report.days[0].available,2);assert.equal(report.days[0].occupied,1);assert.equal(report.days[0].occupancy,50);
 assert.equal(report.days[1].available,1);assert.equal(report.days[1].occupied,0);assert.equal(report.earned,50000);assert.ok(Math.abs(report.utilization-100/3)<1e-10);
});
test('archive reporting uses property-local dates across UTC midnight',()=>{
 const report=reportMetrics({units:[],allUnits:[{id:'old',archivedAt:'2026-10-19T20:00:00Z'}],allocations:[],reservations:[],payments:[]},'2026-10-19','2026-10-20','Asia/Kolkata');
 assert.equal(report.days[0].available,1);assert.equal(report.days[1].available,0);
});
