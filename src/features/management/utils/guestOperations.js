export function refundSummary(reservation, payments = []) {
 const done=payments.filter(p=>p.reservation_id===reservation.id && p.kind==='REFUND').reduce((s,p)=>s+Number(p.amount_paise),0);
 const pending=reservation.status==='CANCELLED'?Number(reservation.paid_amount):Math.max(0,Number(reservation.paid_amount)-Number(reservation.total_amount));
 return {done,pending,status:pending>0?'Pending':done>0?'Done':'Not required'};
}
export function checkinProgress(members=[], reservationId) {
 const rows=members.filter(m=>m.reservation_id===reservationId);
 return {total:rows.length,done:rows.filter(m=>m.status==='completed').length};
}
