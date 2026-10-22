import React,{useState} from 'react';
import CollapsibleCard from '../../../components/ui/CollapsibleCard';
import {dayInZone} from '../../management/utils/metrics';
import {addBookingMember,reissueBookingMember,bindBookingMember,attachWalkin,databaseError} from '../../../services/stayman';
import {useStaff} from '../../../components/auth/StaffGate';
import {bookingCheckinState} from '../utils/bookingCheckinState';
import GuestSubmission from './GuestSubmission';
import CheckinShare from './CheckinShare';

export default function BookingWebCheckin({reservation,data,refresh,isRefreshing=false}) {
 const {property}=useStaff();
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [link,setLink]=useState(''),[phone,setPhone]=useState(''),[walkinId,setWalkinId]=useState(''),[asContact,setAsContact]=useState(false);
 const {members,contactMember,contactCompleted,total,done,allComplete}=bookingCheckinState(data.members,reservation);
 const active=['PENDING','CHECKED_IN'].includes(reservation.status)&&reservation.check_out_date>dayInZone(new Date(),property.timezone);
 const contact=data.guests.find(g=>g.id===reservation.guest_id);
 const contactLocked=contactCompleted||allComplete;
 const selected=data.walkins?.find(w=>w.id===walkinId);

 async function create(member,forContact=false){
  if(busy||isRefreshing||!active||allComplete||member?.status==='completed'||(forContact&&contactLocked))return;
  setBusy(true);setError('');setLink('');
  try{
   let token;
   if(member)token=await reissueBookingMember(member.id);
   else{
    const created=await addBookingMember(reservation.id,forContact?contact.full_name:name.trim(),crypto.randomUUID());
    if(forContact)await bindBookingMember(contact.id,created.id);
    token=created.token;
   }
   setPhone(member?.details?.phone||(forContact?contact?.phone:'')||'');
   setLink(window.location.origin+'/guest-check-in#invite='+token);setName('');await refresh();
  }catch(err){setError(databaseError(err));await refresh();}finally{setBusy(false);}
 }
 async function attach(event){
  event.preventDefault();if(busy||isRefreshing||!active||allComplete)return;
  setBusy(true);setError('');
  try{await attachWalkin(reservation.id,walkinId,asContact);setWalkinId('');setAsContact(false);await refresh();}
  catch(err){setError(databaseError(err));}finally{setBusy(false);}
 }

 return <div className="space-y-4">
  {allComplete&&<p role="status" className="notice">Web check-in completed and linked · {done}/{total} submitted. Submitted details and IDs remain available above.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  <CollapsibleCard title="Guest web check-in link & QR" disabled={contactLocked} summary={contactLocked?'Completed and linked':undefined}>
   <p className="muted">Share a private check-in link with the booking contact, for reservations from any source.</p>
   {active&&!contactLocked&&<button type="button" className="primary" disabled={busy||isRefreshing||!contact?.full_name} onClick={()=>create(contactMember,true)}>{busy?'Generating link...':link?'Generate replacement link / QR':'Generate check-in link / QR'}</button>}
   {!active&&<p className="muted">Web check-in links are available for active reservations before checkout.</p>}
   {link&&!contactLocked&&<CheckinShare key={link} link={link} phone={phone} propertyName={property.name}/>}
  </CollapsibleCard>
  <CollapsibleCard title="Group web check-in" disabled={allComplete} summary={done+'/'+total+' submitted'+(allComplete?' · Completed and linked':'')}>
   <p className="muted">Add each person under this booking, including the lead guest. Show their QR or send their private check-in link on WhatsApp.</p>
   <fieldset disabled={busy||isRefreshing||allComplete} className="space-y-3">
    {active&&!allComplete&&<form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();create();}}>
     <label className="min-w-0 flex-1">Guest name<input required minLength={2} maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label><button className="primary">Add guest & link</button>
    </form>}
    {active&&!allComplete&&data.walkins?.length>0&&<form onSubmit={attach} className="space-y-3 rounded-lg border p-3">
     <label>Link a submitted walk-in<select aria-label="Link a submitted walk-in" required value={walkinId} onChange={event=>setWalkinId(event.target.value)}><option value="">Choose unallocated web check-in</option>{data.walkins.map(w=><option key={w.id} value={w.id}>{w.details.full_name} · {w.details.phone}</option>)}</select></label>
     {selected&&<p className="muted">Submitted stay: {selected.details.arrival_date} to {selected.details.departure_date}. Linking adds this person to the booking without allocating another bed.</p>}
     <label className="flex items-center gap-2"><input type="checkbox" checked={asContact} onChange={event=>setAsContact(event.target.checked)}/>This submission belongs to the booking contact</label><button className="secondary" disabled={!walkinId}>Confirm link to booking</button>
    </form>}
    {members.map(member=><article key={member.id} className="rounded-lg border bg-[#f8faff] p-3">
     <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{member.display_name||member.details?.full_name}</strong><span className={'text-xs font-semibold '+(member.status==='completed'?'text-emerald-600':'text-amber-700')}>{member.status==='completed'?'Web check-in done':isRefreshing?'Checking web check-in status...':'Web check-in not done'}</span></div>
     {member.status==='completed'?<details className="mt-3"><summary className="cursor-pointer text-xs text-blue-600">View guest details & documents</summary><div className="mt-3"><GuestSubmission submission={member}/></div></details>:active&&<button className="secondary mt-3" onClick={()=>create(member)}>Generate new link / QR</button>}
    </article>)}
    {!members.length&&<p className="muted">No guests linked yet. Use a submitted walk-in or add a guest above.</p>}
    <button className="secondary" onClick={refresh}>Refresh check-in status</button>
   </fieldset>
  </CollapsibleCard>
 </div>;
}