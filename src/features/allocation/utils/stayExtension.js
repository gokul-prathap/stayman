import {destinationError} from '../../reservations/utils/bookingActions.js';
import {extendQuote} from '../../reservations/utils/extendQuote.js';
import {shiftDay} from '../../management/utils/metrics.js';
export function draggedDeparture(checkout,pixels,dayWidth){
 const added=Math.max(0,Math.min(365,Math.round(pixels/dayWidth)));
 return shiftDay(checkout,added);
}
export function extensionPlan(data,allocation,departure,today){
 if(allocation?.status==='MAINTENANCE'){
  if(!departure||departure<=allocation.checkOutDate)throw new Error('Choose a later maintenance end date.');
  if((Date.parse(departure)-Date.parse(allocation.checkInDate))/86400000>366)throw new Error('Maintenance may span at most 366 nights.');
  const unit=data.units.find(u=>u.id===allocation.unitId);
  const problem=destinationError(unit,null,data.allocations,null,allocation.checkOutDate,departure);
  if(problem)throw new Error(problem);
  return {maintenance:true,allocation,departure,unit};
 }
 const reservation=data.reservations.find(r=>r.id===allocation?.reservationDbId);
 if(!reservation||!['PENDING','CHECKED_IN'].includes(reservation.status)||reservation.check_out_date<today)throw new Error('Only active stays can be extended.');
 if(allocation.checkOutDate!==reservation.check_out_date)throw new Error('Extend from the final night of this reservation.');
 const unit=data.units.find(u=>u.id===allocation.unitId),guest=data.guests?.find(g=>g.id===reservation.guest_id);
 const problem=destinationError(unit,guest,data.allocations,null,reservation.check_out_date,departure);
 if(problem)throw new Error(problem);
 return {reservation,unit,guest,departure,quote:extendQuote(reservation,unit,departure)};
}
