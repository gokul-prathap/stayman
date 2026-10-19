import test from 'node:test';
import assert from 'node:assert/strict';
import {stayDays,buildStayIndex,stayDaySummary,staySnapshot,staySegments,visibleStayGroups,stayStatus} from '../src/features/allocation/utils/stayView.js';
import {destinationError} from '../src/features/reservations/utils/bookingActions.js';
const units=[{id:'a',roomName:'Mixed Dorm',label:'Bed 1',type:'BED'},{id:'b',roomName:'Mixed Dorm',label:'Bed 2',type:'BED'},{id:'c',roomName:'Garden Room',label:'Room 1',type:'ROOM'}];
const reservations=[{id:'r1',status:'CHECKED_IN',check_out_date:'2026-10-22'},{id:'r2',status:'PENDING',check_out_date:'2026-10-22'},{id:'cancelled',status:'CANCELLED'}];
const allocations=[{id:'one',unitId:'a',reservationDbId:'r1',guestName:'Sample Guest',status:'CHECKED_IN',checkInDate:'2026-10-18',checkOutDate:'2026-10-22'},
 {id:'block',unitId:'b',status:'MAINTENANCE',checkInDate:'2026-10-19',checkOutDate:'2026-10-20'},
 {id:'two',unitId:'c',reservationDbId:'r2',guestName:'Future Guest',status:'PENDING',checkInDate:'2026-10-20',checkOutDate:'2026-10-22'}];
const days=stayDays('2026-10-19'),{index,bookingMap}=buildStayIndex(units,allocations,reservations,days);
test('two weeks means 14 nights across month and year boundaries',()=>{
 assert.equal(days.length,14);assert.equal(days[13],'2026-11-01');
 assert.equal(stayDays('2026-12-28')[13],'2027-01-10');assert.equal(stayDays('2028-02-27',3)[2],'2028-02-29');
});
test('daily availability excludes maintenance, pending bookings and cancelled allocations correctly',()=>{
 const first=stayDaySummary(units,days[0],index,bookingMap);
 assert.equal(first.vacant,1);assert.equal(first.blocked,1);assert.equal(first.occupied,1);assert.equal(first.reserved,0);assert.equal(first.capacity,2);assert.equal(first.occupancy,50);
 const next=stayDaySummary(units,days[1],index,bookingMap);
 assert.equal(next.vacant,1);assert.equal(next.reserved,1);assert.equal(next.blocked,0);assert.equal(next.occupancy,2/3*100);
});
test('checkout dates are free and continuous bars clip correctly to visible dates',()=>{
 assert.equal(index.get('a').get('2026-10-22').length,0);
 assert.deepEqual(staySegments('a',days,index)[0],{start:0,span:3,entries:[allocations[0]]});
 const short=stayDays('2026-10-19',2),shortIndex=buildStayIndex(units,allocations,reservations,short).index;
 assert.equal(staySegments('a',short,shortIndex)[0].span,2);
 assert.equal(staySegments('a',days,index).reduce((sum,s)=>sum+s.span,0),14);
});
test('conflicts are visible without double-counting occupancy or silently hiding stays',()=>{
 const duplicate={...allocations[0],id:'overlap',reservationDbId:'r2'};
 const model=buildStayIndex(units,[...allocations,duplicate],reservations,days);
 const summary=stayDaySummary(units,days[0],model.index,model.bookingMap);
 assert.equal(summary.conflicts,1);assert.equal(summary.booked,1);
 assert.equal(staySegments('a',days,model.index)[0].entries.length,2);
});
test('room grouping, inventory filters and search preserve all matching units',()=>{
 assert.equal(visibleStayGroups(units,allocations,days).length,2);
 assert.equal(visibleStayGroups(units,allocations,days,{inventory:'dorm'}).flatMap(g=>g.units).length,2);
 assert.equal(visibleStayGroups(units,allocations,days,{inventory:'private'}).flatMap(g=>g.units).length,1);
 assert.deepEqual(visibleStayGroups(units,allocations,days,{search:'sample guest'}).flatMap(g=>g.units).map(u=>u.id),['a']);
 assert.equal(visibleStayGroups(units,allocations,days,{search:'does not exist'}).length,0);
});
test('due-out counts final checkout only, not intermediate bed transfers',()=>{
 const split=[{...allocations[0],checkOutDate:'2026-10-20'},{...allocations[0],id:'last',unitId:'b',checkInDate:'2026-10-20'}];
 const model=buildStayIndex(units,split,reservations,days);
 assert.equal(staySnapshot(units,'2026-10-20',model.index,model.bookingMap,split).dueOut,0);
 assert.equal(staySnapshot(units,'2026-10-22',model.index,model.bookingMap,split).dueOut,1);
 assert.equal(stayStatus(split[1],model.bookingMap,'2026-10-22'),'due-out');
});
test('fully blocked or empty inventory never yields NaN or infinity',()=>{
 const allBlocked=units.map(u=>({...allocations[1],id:u.id,unitId:u.id})),model=buildStayIndex(units,allBlocked,reservations,days);
 assert.equal(stayDaySummary(units,days[0],model.index,model.bookingMap).occupancy,0);
 assert.equal(stayDaySummary([],days[0],model.index,model.bookingMap).occupancy,0);
});
test('every stored hold rejected by booking validation remains visible in the chart',()=>{
 for(const reservationDbId of ['cancelled','missing-booking']){
  const hold={id:'hold',unitId:'c',reservationDbId,status:'PENDING',checkInDate:'2026-10-19',checkOutDate:'2026-10-20'};
  const model=buildStayIndex(units,[hold],reservations,days);
  assert.match(destinationError(units[2],null,[hold],null,days[0],days[1]),/Occupied/);
  assert.equal(model.index.get('c').get(days[0]).length,1);
  assert.equal(stayStatus(hold,model.bookingMap,days[0]),'held');
  const summary=stayDaySummary([units[2]],days[0],model.index,model.bookingMap);
  assert.equal(summary.vacant,0);assert.equal(summary.blocked,1);
 }
});
test('multi-night booking reports a conflict beyond the arrival night with exact dates',()=>{
 const block={id:'future-block',unitId:'c',status:'MAINTENANCE',reason:'Painting',checkInDate:'2026-10-21',checkOutDate:'2026-10-23'};
 const model=buildStayIndex(units,[block],reservations,days);
 assert.equal(model.index.get('c').get('2026-10-20').length,0);
 const message=destinationError(units[2],null,[block],null,'2026-10-20','2026-10-24');
 assert.match(message,/Garden Room \/ Room 1/);assert.match(message,/Maintenance \(Painting\)/);assert.match(message,/2026-10-21 to 2026-10-23/);
 assert.equal(destinationError(units[2],null,[block],null,'2026-10-23','2026-10-24'),'');
});
