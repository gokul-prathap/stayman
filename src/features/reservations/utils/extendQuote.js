import {nights} from '../../management/utils/metrics.js';
export function extendQuote(reservation,target,departure){
 if(!reservation||!target||!departure||departure<=reservation.check_out_date)throw new Error('Choose a later departure and a bed.');
 const duration=nights(reservation.check_out_date,departure);
 const total=Number(reservation.total_amount),paid=Number(reservation.paid_amount),rate=Number(target.nightlyRatePaise);
 if(!Number.isInteger(duration)||duration<1||!Number.isSafeInteger(rate)||rate<0||!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(paid)||paid<0)throw new Error('Refresh the reservation and rates.');
 const extra=rate*duration,newTotal=total+extra;
 if(!Number.isSafeInteger(newTotal))throw new Error('Extension amount is too large.');
 return {duration,extra,newTotal,balance:newTotal-paid};
}
