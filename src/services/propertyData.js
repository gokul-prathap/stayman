// Shared normalization for the bounded workspace RPC and legacy callers.
export function mergeCheckinStatuses(cached,detail){
 if(!cached?.members||!detail?.members)return cached;
 const latest=new Map(detail.members.map(member=>[member.id,member]));
 let changed=false;
 const members=cached.members.map(member=>{
  const current=latest.get(member.id);
  if(!current||current.reservation_id!==member.reservation_id||current.status===member.status&&current.guest_id===member.guest_id)return member;
  changed=true;
  // Lists only need status/contact metadata, not private submitted details.
  return {...member,status:current.status,guest_id:current.guest_id};
 });
 return changed?{...cached,members}:cached;
}
export function normalizePropertyData(raw) {
 const allUnits=(raw.units||[]).map(u=>({id:u.id,label:u.label,roomName:u.room_name,archivedAt:u.archived_at||null,category:u.unit_type==='BED'?'DORMITORY':'PRIVATE',type:u.unit_type,genderPolicy:u.gender_policy,nightlyRatePaise:Number(u.nightly_rate_paise||0)})).sort((a,b)=>(a.roomName+a.label).localeCompare(b.roomName+b.label));
 const reservations=raw.reservations||[],guests=raw.guests||[];
 const bookings=new Map(reservations.map(r=>[r.id,r])),contacts=new Map(guests.map(g=>[g.id,g]));
 const allocations=(raw.allocations||[]).map(a=>{
  const r=bookings.get(a.reservation_id),g=contacts.get(r?.guest_id);
  return {id:a.id,unitId:a.unit_id,reservationId:r?.booking_ref,reservationDbId:a.reservation_id,guestName:g?.full_name,phone:g?.phone,gender:g?.gender,nationality:g?.nationality,chargePaise:a.charge_paise==null?undefined:Number(a.charge_paise),checkInDate:a.check_in_date,checkOutDate:a.check_out_date,status:a.status,totalAmount:Number(r?.total_amount||0)/100,paidAmount:Number(r?.paid_amount||0)/100,reason:a.reason};
 });
 const folioPayments=(raw.folio_payments||[]).map(p=>({...p,amount_paise:p.amount,kind:'RECEIPT',folio_receipt:true}));
 return {...raw,units:allUnits.filter(u=>!u.archivedAt),allUnits,reservations,guests,allocations,payments:[...(raw.payments||[]),...folioPayments].sort((a,b)=>b.paid_at.localeCompare(a.paid_at)),members:raw.members||[],walkins:raw.walkins||[],team:raw.team||[]};
}
