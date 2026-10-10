import React,{useState} from 'react';
import {addBookingMember,reissueBookingMember,attachWalkin,databaseError} from '../../../services/stayman';
import {usePropertyData} from '../hooks/usePropertyData';
import {useStaff} from '../../../components/auth/StaffGate';
import {checkinProgress} from '../../management/utils/guestOperations';
import GuestSubmission from './GuestSubmission';
import CheckinShare from './CheckinShare';
export default function BookingWebCheckin({reservation}) {
 const {data,refresh}=usePropertyData(),{property}=useStaff();
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[link,setLink]=useState(''),[phone,setPhone]=useState(''),[walkinId,setWalkinId]=useState(''),[asContact,setAsContact]=useState(false);
 const members=(data.members||[]).filter(m=>m.reservation_id===reservation.id),progress=checkinProgress(members,reservation.id);
 const active=['PENDING','CHECKED_IN'].includes(reservation.status);
 async function create(member){if(busy)return;setBusy(true);setError('');setLink('');try{
 const token=member?await reissueBookingMember(member.id):(await addBookingMember(reservation.id,name.trim(),crypto.randomUUID())).token;
 setPhone(member?.details?.phone||'');setLink(window.location.origin+'/guest-check-in#invite='+token);setName('');await refresh();
 }catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 async function attach(e){e.preventDefault();setBusy(true);setError('');try{await attachWalkin(reservation.id,walkinId,asContact);setWalkinId('');setAsContact(false);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 const selected=data.walkins?.find(w=>w.id===walkinId);
 return <section className="space-y-4 rounded-xl border p-4"><div className="flex justify-between gap-2"><h2>Group web check-in</h2><span className="text-xs font-semibold">{progress.done}/{progress.total} submitted</span></div><p className="muted">Add each person under this booking, including the lead guest. Show their QR or send their private check-in link on WhatsApp.</p>
 {active&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();create();}}><label className="min-w-0 flex-1">Guest name<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy} className="primary">Add guest & link</button></form>}
 {active&&data.walkins?.length>0&&<form onSubmit={attach} className="space-y-3 rounded-lg border p-3"><label>Link a submitted walk-in<select aria-label="Link a submitted walk-in" required value={walkinId} onChange={e=>setWalkinId(e.target.value)}><option value="">Choose unallocated web check-in</option>{data.walkins.map(w=><option key={w.id} value={w.id}>{w.details.full_name} · {w.details.phone}</option>)}</select></label>{selected&&<p className="muted">Submitted stay: {selected.details.arrival_date} to {selected.details.departure_date}. These details are preserved; linking adds this person to this booking without allocating another bed.</p>}<label className="flex items-center gap-2"><input type="checkbox" checked={asContact} onChange={e=>setAsContact(e.target.checked)}/>This submission belongs to the booking contact</label><button className="secondary" disabled={busy||!walkinId}>Confirm link to booking</button></form>}
 {link&&<CheckinShare key={link} link={link} phone={phone} propertyName={property.name}/>}
 {error&&<p className="error" role="alert">{error}</p>}
 {members.map(m=><article key={m.id} className="rounded-lg border bg-[#f8faff] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{m.details?.full_name||m.display_name}</strong><span className={'text-xs font-semibold '+(m.status==='completed'?'text-emerald-600':'text-amber-700')}>{m.status==='completed'?'Web check-in done':'Web check-in not done'}</span></div>{m.status==='completed'?<details className="mt-3"><summary className="cursor-pointer text-xs text-blue-600">View guest details & documents</summary><div className="mt-3"><GuestSubmission submission={m}/></div></details>:active&&<button disabled={busy} className="secondary mt-3" onClick={()=>create(m)}>Generate new link / QR</button>}</article>)}
 {!members.length&&<p className="muted">No guests linked yet. Use a submitted walk-in or add a guest above.</p>}<button className="secondary" disabled={busy} onClick={refresh}>Refresh check-in status</button></section>;
}
