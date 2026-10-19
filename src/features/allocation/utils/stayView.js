import {shiftDay,roomGroups} from '../../management/utils/metrics.js';

export function stayDays(start,count=14){return Array.from({length:count},(_,i)=>shiftDay(start,i));}

export function buildStayIndex(units,allocations,reservations,days){
 const bookingMap=new Map(reservations.map(r=>[r.id,r]));
 const index=new Map(units.map(u=>[u.id,new Map(days.map(day=>[day,[]]))]));
 for(const allocation of allocations){
  // Any physical allocation blocks the database exclusion constraint, even if
  // its booking is cancelled or missing from the loaded reservation list.
  if(!index.has(allocation.unitId))continue;
  for(const day of days)if(allocation.checkInDate<=day&&allocation.checkOutDate>day)index.get(allocation.unitId).get(day).push(allocation);
 }
 return {index,bookingMap};
}

export function stayDaySummary(units,day,index,bookingMap){
 let vacant=0,occupied=0,reserved=0,blocked=0,booked=0,conflicts=0,dueOut=0;
 for(const unit of units){
  const entries=index.get(unit.id)?.get(day)||[];
  if(entries.length>1)conflicts++;
  const isHold=a=>a.status==='MAINTENANCE'||!bookingMap.has(a.reservationDbId)||bookingMap.get(a.reservationDbId).status==='CANCELLED';
  const maintenance=entries.some(isHold);
  const stays=entries.filter(a=>!isHold(a));
  if(maintenance)blocked++;
  if(stays.length){booked++;if(stays.some(a=>bookingMap.get(a.reservationDbId)?.status!=='PENDING'))occupied++;else reserved++;}
  else if(!maintenance)vacant++;
 }
 const capacity=units.length-blocked;
 return {total:units.length,vacant,occupied,reserved,blocked,booked,conflicts,dueOut,capacity,occupancy:capacity?booked/capacity*100:0};
}

export function staySnapshot(units,day,index,bookingMap,allocations){
 const summary=stayDaySummary(units,day,index,bookingMap),ids=new Set(units.map(u=>u.id));
 summary.dueOut=new Set(allocations.filter(a=>ids.has(a.unitId)&&a.status!=='MAINTENANCE'&&a.checkOutDate===day&&bookingMap.get(a.reservationDbId)?.status!=='CANCELLED'&&bookingMap.get(a.reservationDbId)?.check_out_date===day).map(a=>a.unitId)).size;
 return summary;
}

export function staySegments(unitId,days,index){
 const segments=[];
 for(let i=0;i<days.length;i++){
  const entries=index.get(unitId)?.get(days[i])||[],previous=segments[segments.length-1];
  if(entries.length===1&&previous?.entries.length===1&&previous.entries[0].id===entries[0].id){previous.span++;continue;}
  segments.push({start:i,span:1,entries});
 }
 return segments;
}

export function visibleStayGroups(units,allocations,days,{inventory='all',search=''}={}){
 const term=search.trim().toLowerCase();
 const matchingUnits=new Set(allocations.filter(a=>a.checkInDate<=days[days.length-1]&&a.checkOutDate>days[0]&&(a.guestName||'').toLowerCase().includes(term)).map(a=>a.unitId));
 return roomGroups(units.filter(u=>(inventory==='all'||(inventory==='dorm'?u.type==='BED':inventory==='private'?u.type==='ROOM':JSON.stringify([u.type,u.roomName])===inventory))&&(!term||[u.roomName,u.label].some(value=>(value||'').toLowerCase().includes(term))||matchingUnits.has(u.id)))).map(group=>({...group,units:[...group.units].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}))}));
}

export function stayStatus(allocation,bookingMap,today){
 if(allocation.status==='MAINTENANCE')return 'blocked';
 const booking=bookingMap.get(allocation.reservationDbId);
 if(!booking||booking.status==='CANCELLED')return 'held';
 if(booking?.status==='CHECKED_IN'&&booking.check_out_date===today)return 'due-out';
 if(booking?.status==='CHECKED_OUT')return 'departed';
 return booking?.status==='CHECKED_IN'?'occupied':'reserved';
}
