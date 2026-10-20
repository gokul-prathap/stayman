// Shared by the dashboard and navbar so their actionable counts stay identical.
export function webCheckinTasks(data,today){
 const walkins=data?.walkins||[];
 const submitted=new Set((data?.members||[]).filter(member=>member.status==='completed').map(member=>member.reservation_id));
 const bookings=(data?.reservations||[]).filter(booking=>booking.status==='PENDING'&&booking.check_out_date>today&&submitted.has(booking.id)).sort((a,b)=>a.check_in_date.localeCompare(b.check_in_date)||a.id.localeCompare(b.id));
 const due=bookings.filter(booking=>booking.check_in_date<=today),upcoming=bookings.filter(booking=>booking.check_in_date>today);
 return {walkins,due,upcoming,count:walkins.length+due.length};
}
