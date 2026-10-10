import { nights } from '../../management/utils/metrics.js';
export function defaultBookingStatus(arrival, today) { return arrival === today ? 'CHECKED_IN' : 'PENDING'; }
export function destinationError(target, guest, allocations, reservationId, from, to) {
 if (!target) return 'Choose a bed or room.';
 if (!from || !to || from>=to) return 'Choose valid move dates.';
 if (guest && ((target.genderPolicy==='FEMALE_ONLY' && guest?.gender!=='FEMALE') || (target.genderPolicy==='MALE_ONLY' && guest?.gender!=='MALE'))) return 'Room gender policy does not match.';
 if (allocations.some(a => (!reservationId || a.reservationDbId!==reservationId) && a.unitId===target.id && a.checkInDate<to && a.checkOutDate>from)) return 'Occupied or under maintenance.';
 return '';
}
export function chargeBetween(allocation, from, to) {
 const first=from>allocation.checkInDate ? from : allocation.checkInDate;
 const last=to<allocation.checkOutDate ? to : allocation.checkOutDate;
 if (first>=last) return 0;
 if (!Number.isSafeInteger(allocation.chargePaise)) throw new Error('Apply migration 008 and refresh before moving.');
 const duration=nights(allocation.checkInDate,allocation.checkOutDate), charge=BigInt(allocation.chargePaise);
 return Number(charge*BigInt(nights(allocation.checkInDate,last))/BigInt(duration)-charge*BigInt(nights(allocation.checkInDate,first))/BigInt(duration));
}
export function transferQuote(reservation, target, allocations, from, to) {
 if (!reservation || !target || from<reservation.check_in_date || to>reservation.check_out_date || from>=to) throw new Error('Choose dates within the booked stay.');
 const parts=allocations.filter(a => a.reservationDbId===reservation.id && a.checkInDate<to && a.checkOutDate>from);
 const coverage=parts.reduce((sum,a) => sum+nights(from>a.checkInDate ? from : a.checkInDate,to<a.checkOutDate ? to : a.checkOutDate),0);
 if (coverage!==nights(from,to)) throw new Error('Some selected nights have no bed allocation.');
 if (parts.every(a => a.unitId===target.id)) throw new Error('Choose a different destination.');
 const removed=parts.reduce((sum,a) => sum+chargeBetween(a,from,to),0);
 const newCharge=target.nightlyRatePaise*nights(from,to);
 const newTotal=Number(reservation.total_amount)-removed+newCharge;
 const paid=Number(reservation.paid_amount);
 return { totalBefore:Number(reservation.total_amount),newTotal,paid,removed,newCharge,due:Math.max(0,newTotal-paid),refund:Math.max(0,paid-newTotal) };
}
