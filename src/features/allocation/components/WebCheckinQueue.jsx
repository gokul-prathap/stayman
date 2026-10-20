import {useState} from 'react';
import {webCheckinTasks} from '../../reservations/utils/webCheckinTasks';

import {usePropertyData} from '../../reservations/hooks/usePropertyData';
import {useStaff} from '../../../components/auth/StaffGate';
import {dayInZone} from '../../management/utils/metrics';
import {checkInReservation,databaseError} from '../../../services/stayman';
import NewGuestBooking from '../../reservations/components/NewGuestBooking';

export default function WebCheckinQueue({onReview}) {
 const {property}=useStaff();
 const {data,refresh,isFetching,error}=usePropertyData({refetchInterval:30000});
 const [walkinId,setWalkinId]=useState(null),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const today=dayInZone(new Date(),property.timezone);
 const {walkins,due,upcoming}=webCheckinTasks(data,today);
 async function checkIn(id) {
  if(busy)return;
  setBusy(id);setFailure('');setMessage('');
  try {await checkInReservation(id);setMessage('Guest checked in. Give them their room / bed assignment.');await refresh();}
  catch(err){setFailure(databaseError(err));}finally{setBusy('');}
 }
 function bookingRow(r,future=false) {
  const guest=data.guests.find(g=>g.id===r.guest_id);
  const reviewRequired=(data.members||[]).some(m=>m.reservation_id===r.id&&m.status==='completed'&&Object.values(m.details?.document_screening||{}).includes('manual-review'));
  const rooms=data.allocations.filter(a=>a.reservationDbId===r.id&&a.checkInDate<=today&&a.checkOutDate>today).map(a=>{const u=data.units.find(u=>u.id===a.unitId);return u?u.roomName+' / '+u.label:'';}).filter(Boolean).join(', ');
  return <li key={r.id} className="web-checkin-row"><button className="web-checkin-name" title={guest?.full_name||"Guest"} onClick={()=>onReview(r.id)}>{guest?.full_name||"Guest"}</button>{future||!rooms||reviewRequired?<button className="primary" onClick={()=>onReview(r.id)}>{reviewRequired?"Review ID":"Review"}</button>:<button className="primary" disabled={!!busy} title="Confirm the guest has arrived before checking in" onClick={()=>checkIn(r.id)}>{busy===r.id?"Checking in...":"Check in"}</button>}</li>;
 }
 return <article className="card web-checkin-queue" aria-label="Web check-in tasks"><div className="dashboard-card-heading"><h2>Web check-ins <span>· {walkins.length+due.length} need action</span></h2><button className="secondary" disabled={isFetching} onClick={refresh}>{isFetching?'Updating…':'Refresh'}</button></div>
 {error&&<p role="alert" className="error">Could not update web check-ins. Please refresh.</p>}
 {message&&<p role="status" className="notice">{message}</p>}{failure&&<p role="alert" className="error">{failure}</p>}
 <ul className="web-checkin-list" tabIndex={0} aria-label="Pending web check-ins">{walkins.map(w=><li key={w.id} className="web-checkin-row"><span className="web-checkin-name" title={w.details.full_name}>{w.details.full_name}</span><button className="primary" onClick={()=>setWalkinId(w.id)}>{Object.values(w.details.document_screening||{}).includes("manual-review")?"Allocate · ID review":"Allocate bed"}</button></li>)}{due.map(r=>bookingRow(r))}</ul>
 {!walkins.length&&!due.length&&<p className="notice">All caught up — no web check-ins need action now.</p>}
 {upcoming.length>0&&<details><summary>Upcoming web check-ins ({upcoming.length})</summary><ul className="web-checkin-list" tabIndex={0} aria-label="Upcoming web check-ins">{upcoming.map(r=>bookingRow(r,true))}</ul></details>}
 {walkinId&&<NewGuestBooking walkinId={walkinId} onClose={()=>setWalkinId(null)} onSaved={async()=>{setMessage('Room / bed allocated. The booking status shows whether the guest is checked in or awaiting arrival.');await refresh();}}/>}
 </article>;
}
