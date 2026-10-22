export function bookingCheckinState(members=[],reservation){
 const linked=members.filter(m=>m.reservation_id===reservation.id);
 const submitted=linked.filter(m=>m.status==='completed');
 // An optional contact association does not change invitation completion.
 const contactMember=linked.find(m=>m.guest_id===reservation.guest_id)||null;
 return {members:linked,submitted,contactMember,contactCompleted:contactMember?.status==='completed',total:linked.length,done:submitted.length,allComplete:linked.length>0&&submitted.length===linked.length};
}
