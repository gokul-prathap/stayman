import {genderLabel} from '../../../services/guestGender';
import AppLoader from '../../../components/ui/AppLoader';
import ReservationDetails from './ReservationDetails';
import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useStaff} from '../../../components/auth/StaffGate';
import {guestCheckinLink,reissueBookingMember,bindBookingMember,databaseError,guestProfile,renameGuest} from '../../../services/stayman';
import GuestSubmission from './GuestSubmission';
import CheckinShare from './CheckinShare';
import {dayInZone} from '../../management/utils/metrics';
export default function GuestProfile({guestId,memberId,walkinId,onAllocate}) {
 const {property}=useStaff(),client=useQueryClient();
 const kind=guestId?'guest':memberId?'member':'walkin',id=guestId||memberId||walkinId;
 const query=useQuery({queryKey:['guest-profile',property.id,kind,id],queryFn:()=>guestProfile(property.id,kind,id),refetchOnWindowFocus:true});
 const data=query.data||{guests:[],members:[],walkins:[],reservations:[]};
 const refresh=()=>Promise.all([query.refetch(),client.invalidateQueries({queryKey:['guest-directory',property.id]}),client.invalidateQueries({queryKey:['global-search',property.id]}),client.invalidateQueries({queryKey:['stayman',property.id]})]);
 const [editing,setEditing]=useState(false),[newName,setNewName]=useState(''),[bookingId,setBookingId]=useState('');
 const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[bindId,setBindId]=useState('');
 const guest=data.guests.find(g=>g.id===guestId);
 const member=data.members.find(m=>m.id===memberId);
 const walkin=data.walkins.find(w=>w.id===walkinId);
 const today=dayInZone(new Date(),property.timezone);
 const linked=guest?data.members.filter(m=>m.guest_id===guest.id):[];
 const related=data.reservations.filter(r=>r.guest_id===guest?.id||linked.some(m=>m.reservation_id===r.id));
 const rank=r=>r.status==='CANCELLED'||r.status==='CHECKED_OUT'||r.check_out_date<=today?2:r.check_in_date>today?1:0;
 const relevant=[...related].sort((a,b)=>rank(a)-rank(b)||(rank(a)===2?b.check_in_date.localeCompare(a.check_in_date):a.check_in_date.localeCompare(b.check_in_date)))[0];
 const relevantLinked=linked.filter(m=>m.reservation_id===relevant?.id);
 const submission=walkin||member||relevantLinked.find(m=>m.status==='completed')||relevantLinked[0];
 const details=submission?.details;
 const name=guest?.full_name||member?.display_name||walkin?.staff_name||details?.full_name||'Guest';
 const phone=details?.phone||guest?.phone||'';
 const activeBooking=data.reservations.some(r=>r.status!=='CANCELLED'&&r.status!=='CHECKED_OUT'&&r.check_out_date>today&&(member?r.id===member.reservation_id:r.guest_id===guest?.id||linked.some(m=>m.reservation_id===r.id)));
 const candidates=guest?data.members.filter(m=>!m.guest_id&&data.reservations.some(r=>r.id===m.reservation_id&&r.guest_id===guest.id)):[];
 async function create(){if(busy)return;if(!activeBooking){setError('');setLink(window.location.origin+'/guest-check-in?property='+property.id);return;}setBusy(true);setError('');setLink('');try{const existing=member||relevantLinked.find(m=>m.status!=='completed');const result=existing?{token:await reissueBookingMember(existing.id)}:await guestCheckinLink(guest.id);if(result.token)setLink(window.location.origin+'/guest-check-in#invite='+result.token);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 async function bind(){setBusy(true);setError('');try{await bindBookingMember(guest.id,bindId);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 async function saveName(event){event.preventDefault();setBusy(true);setError('');try{await renameGuest(property.id,kind,id,newName.trim());setEditing(false);await refresh();}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 if(query.isPending)return <AppLoader label="Loading guest details..."/>;
 if(query.error)return <p role="alert" className="error">{databaseError(query.error)} <button onClick={()=>query.refetch()}>Retry</button></p>;
 if(!guest&&!member&&!walkin)return <p className="notice">Guest was linked or updated. Refresh the guest list.</p>;
 return <section className="management space-y-4"><header><div className="flex flex-wrap items-center justify-between gap-2"><h2>{name}</h2><button className="secondary" onClick={()=>{setNewName(name);setEditing(true);}}>Edit name</button></div><p className="muted mt-2">{phone} {details?.email||guest?.email||''}</p><p className="muted mt-1">Gender: {genderLabel(details?.gender||guest?.gender)}</p></header> {editing&&<form onSubmit={saveName} className="card space-y-3"><label>Guest name<input required minLength={2} maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/></label><p className="muted">Updates the staff display name. Original submitted identity details remain preserved.</p><div className="flex gap-2"><button className="primary" disabled={busy}>Save name</button><button type="button" className="secondary" onClick={()=>setEditing(false)}>Cancel</button></div></form>}<GuestSubmission submission={submission}/>
 {walkin&&<><p className="notice">Web check-in received. Awaiting room or bed allocation.</p><button className="primary" onClick={()=>onAllocate?.(walkin.id)}>Create reservation & allocate bed</button></>}
 {submission?.status!=='completed'&&!walkin&&<><p className="muted">{activeBooking?'Create a private link for this guest, show the QR at reception or share it on WhatsApp.':'No active reservation. Share the reception QR for a new walk-in; their submission will appear in Awaiting allocation.'}</p><button className="primary" disabled={busy} onClick={create}>{busy?'Preparing…':'Create web check-in link / QR'}</button></>}
 {candidates.length>0&&!linked.length&&<div className="rounded-lg border p-3"><p className="muted mb-2">Already added this person under a booking? Select their existing record explicitly.</p><label>Existing booking guest<select value={bindId} onChange={e=>setBindId(e.target.value)}><option value="">Choose guest record</option>{candidates.map(m=><option key={m.id} value={m.id}>{m.details?.full_name||m.display_name} · {m.status==='completed'?'submitted':'pending'}</option>)}</select></label><button className="secondary mt-2" disabled={busy||!bindId} onClick={bind}>Link this guest record</button></div>}
 <div className="space-y-2"><h3 className="font-semibold text-sm">Reservations</h3>{data.reservations.filter(r=>member?r.id===member.reservation_id:(r.guest_id===guest?.id||linked.some(m=>m.reservation_id===r.id))).map(r=><button className="secondary block w-full text-left" key={r.id} onClick={()=>setBookingId(bookingId===r.id?'':r.id)}>{r.booking_ref} · {r.check_in_date} to {r.check_out_date} · View reservation</button>)}{bookingId&&<ReservationDetails key={bookingId} reservationId={bookingId}/>}</div>
 {link&&<CheckinShare publicLink={!link.includes('#invite=')} key={link} link={link} phone={phone} propertyName={property.name}/>}
 {error&&<p role="alert" className="error">{error}</p>}</section>;
}
