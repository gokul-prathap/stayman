import React,{useState} from 'react';
import {usePropertyData} from '../hooks/usePropertyData';
import {useStaff} from '../../../components/auth/StaffGate';
import {guestCheckinLink,reissueBookingMember,bindBookingMember,databaseError} from '../../../services/stayman';
import GuestSubmission from './GuestSubmission';
import CheckinShare from './CheckinShare';
export default function GuestProfile({guestId,memberId,walkinId,onAllocate}) {
 const {data,refresh}=usePropertyData(),{property}=useStaff();
 const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[bindId,setBindId]=useState('');
 const guest=data.guests.find(g=>g.id===guestId);
 const member=data.members.find(m=>m.id===memberId);
 const walkin=data.walkins.find(w=>w.id===walkinId);
 const linked=guest?data.members.filter(m=>m.guest_id===guest.id):[];
 const submission=walkin||member||linked.find(m=>m.status==='completed')||linked[0];
 const details=submission?.details;
 const name=details?.full_name||member?.display_name||guest?.full_name||'Guest';
 const phone=details?.phone||guest?.phone||'';
 const candidates=guest?data.members.filter(m=>!m.guest_id&&data.reservations.some(r=>r.id===m.reservation_id&&r.guest_id===guest.id)):[];
 async function create(){if(busy)return;setBusy(true);setError('');setLink('');try{const result=member?{token:await reissueBookingMember(member.id)}:await guestCheckinLink(guest.id);if(result.token)setLink(window.location.origin+'/guest-check-in#invite='+result.token);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 async function bind(){setBusy(true);setError('');try{await bindBookingMember(guest.id,bindId);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 if(!guest&&!member&&!walkin)return <p className="notice">Guest was linked or updated. Refresh the guest list.</p>;
 return <section className="management space-y-4"><header><h2>{name}</h2><p className="muted mt-2">{phone} {details?.email||guest?.email||''}</p></header><GuestSubmission submission={submission}/>
 {walkin&&<><p className="notice">Web check-in received. Awaiting room or bed allocation.</p><button className="primary" onClick={()=>onAllocate(walkin.id)}>Create reservation & allocate bed</button></>}
 {submission?.status!=='completed'&&!walkin&&<><p className="muted">Create a private link for this guest, show the QR at reception or share it on WhatsApp.</p><button className="primary" disabled={busy} onClick={create}>{busy?'Preparing…':'Create web check-in link / QR'}</button></>}
 {candidates.length>0&&!linked.length&&<div className="rounded-lg border p-3"><p className="muted mb-2">Already added this person under a booking? Select their existing record explicitly.</p><label>Existing booking guest<select value={bindId} onChange={e=>setBindId(e.target.value)}><option value="">Choose guest record</option>{candidates.map(m=><option key={m.id} value={m.id}>{m.details?.full_name||m.display_name} · {m.status==='completed'?'submitted':'pending'}</option>)}</select></label><button className="secondary mt-2" disabled={busy||!bindId} onClick={bind}>Link this guest record</button></div>}
 {link&&<CheckinShare key={link} link={link} phone={phone} propertyName={property.name}/>}
 {error&&<p role="alert" className="error">{error}</p>}</section>;
}
