// Derive a review flag from property-local time; never mutate booking/payment status.
export function departureReview(reservation,property,now=new Date()){
 if(!['PENDING','CHECKED_IN'].includes(reservation?.status))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:property.timezone||'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=key=>parts.find(p=>p.type===key)?.value;
 const local=part('year')+'-'+part('month')+'-'+part('day')+'T'+part('hour')+':'+part('minute')+':'+part('second');
 const time=/^\d{2}:\d{2}(:\d{2})?$/.test(property.check_out_time||'')?property.check_out_time:'11:00';
 const deadline=reservation.check_out_date+'T'+(time.length===5?time+':00':time);
 return local>=deadline?(reservation.status==='CHECKED_IN'?'overdue':'past_pending'):null;
}
