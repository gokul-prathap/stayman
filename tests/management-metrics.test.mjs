import test from 'node:test';
import assert from 'node:assert/strict';
import { dayInZone, shiftDay, nights, stayKind, reportMetrics, rupeesToPaise, roomGroups } from '../src/features/management/utils/metrics.js';
test('guest classification treats checkout day as past and ignores cancellations', () => {
 const r={check_in_date:'2026-10-09',check_out_date:'2026-10-11',status:'PENDING'};
 assert.equal(stayKind([r],'2026-10-10'),'current');
 assert.equal(stayKind([r],'2026-10-11'),'past');
 assert.equal(stayKind([{...r,check_in_date:'2026-10-12'}],'2026-10-10'),'future');
 assert.equal(stayKind([{...r,status:'CANCELLED'}],'2026-10-10'),'past');
 assert.equal(stayKind([{...r,status:'CHECKED_OUT'}],'2026-10-10'),'past');
 assert.equal(stayKind([r,{...r,check_in_date:'2026-10-12'}],'2026-10-10'),'current');
});
test('money conversion uses exact paise and rejects invalid values', () => {
 assert.equal(rupeesToPaise('19.99'),1999); assert.equal(rupeesToPaise('0'),0); assert.equal(rupeesToPaise('100.1'),10010);
 for(const value of ['','-1','1.234','NaN','1e3']) assert.throws(() => rupeesToPaise(value));
});
test('pricing groups dorm beds together without merging private rooms of the same name', () => {
 assert.deepEqual(roomGroups([{type:'BED',roomName:'A',id:1},{type:'BED',roomName:'A',id:2},{type:'ROOM',roomName:'A',id:3}]).map(g=>g.units.length),[2,1]);
});
test('reports preserve split stays, exclude checkout and reduce capacity for maintenance', () => {
 const data={units:[{id:'a'},{id:'b'}],reservations:[{id:'r',check_in_date:'2026-10-10',check_out_date:'2026-10-12',total_amount:100000,status:'CHECKED_IN'}],
 allocations:[{unitId:'a',reservationDbId:'r',checkInDate:'2026-10-10',checkOutDate:'2026-10-11',status:'CHECKED_IN'},
 {unitId:'b',reservationDbId:'r',checkInDate:'2026-10-11',checkOutDate:'2026-10-12',status:'CHECKED_IN'},
 {unitId:'b',checkInDate:'2026-10-10',checkOutDate:'2026-10-11',status:'MAINTENANCE'}],
 payments:[{method:'CASH',amount_paise:25000,paid_at:'2026-10-10T20:00:00Z'},{method:'OPENING',amount_paise:50000,paid_at:'2026-10-10T00:00:00Z'}]};
 const report=reportMetrics(data,'2026-10-10','2026-10-12');
 assert.equal(report.occupied,2); assert.equal(report.available,5); assert.equal(report.occupancy,40);
 assert.equal(report.earned,100000); assert.equal(report.adr,50000); assert.equal(report.cash,25000); assert.equal(report.opening,50000);
 assert.equal(report.days[0].cash,0); assert.equal(report.days[1].cash,25000); assert.equal(report.days[2].occupied,0);
 assert.equal(report.departures.length,1);
 assert.equal(reportMetrics({...data,reservations:[{...data.reservations[0],status:'CANCELLED'}]},'2026-10-10','2026-10-12').earned,0);
});
test('empty reports avoid NaN and invalid ranges are rejected', () => {
 const data={units:[],allocations:[],reservations:[],payments:[]};
 const report=reportMetrics(data,'2026-10-10','2026-10-10');
 assert.equal(report.occupancy,0); assert.equal(report.adr,0); assert.equal(report.utilization,0);
 assert.throws(()=>reportMetrics(data,'2026-10-11','2026-10-10'));
 assert.throws(()=>reportMetrics(data,'2025-01-01','2026-10-10'));
 assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
 assert.equal(nights('2026-10-10','2026-10-12'),2);
 assert.equal(dayInZone('2026-10-09T20:00:00Z'),'2026-10-10');
});

test('reports use per-allocation prices after a move and deduct actual refunds', () => {
 const data={units:[{id:'private'},{id:'dorm'}],
 reservations:[{id:'r',check_in_date:'2026-10-10',check_out_date:'2026-10-13',total_amount:300000,status:'CHECKED_IN'}],
 allocations:[{unitId:'private',reservationDbId:'r',checkInDate:'2026-10-10',checkOutDate:'2026-10-11',chargePaise:200000,status:'CHECKED_IN'},
 {unitId:'dorm',reservationDbId:'r',checkInDate:'2026-10-11',checkOutDate:'2026-10-13',chargePaise:100000,status:'CHECKED_IN'}],
 payments:[{method:'CASH',kind:'REFUND',amount_paise:300000,paid_at:'2026-10-12T10:00:00Z'}]};
 assert.equal(reportMetrics(data,'2026-10-10','2026-10-10').earned,200000);
 const report=reportMetrics(data,'2026-10-10','2026-10-13');
 assert.equal(report.earned,300000); assert.equal(report.cash,-300000);
});
