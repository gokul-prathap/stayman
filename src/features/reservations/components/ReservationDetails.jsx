import BookingWebCheckin from './BookingWebCheckin';
import EditReservation from './EditReservation';
import {refundSummary} from '../../management/utils/guestOperations';
import React, { useRef, useState } from 'react';
import { usePropertyData } from '../hooks/usePropertyData';
import { useStaff } from '../../../components/auth/StaffGate';
import { recordPayment, recordRefund, cancelReservation, checkInReservation, transferReservation, databaseError } from '../../../services/stayman';
import { money, rupeesToPaise, dayInZone, shiftDay } from '../../management/utils/metrics';
import { destinationError, transferQuote } from '../utils/bookingActions';
import '../../management/management.css';
export default function ReservationDetails({ reservationId }) {
 const { data,refresh }=usePropertyData();
 const { property }=useStaff();
 const [panel,setPanel]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('CASH'),[note,setNote]=useState(''),[reason,setReason]=useState('');
 const [targetId,setTargetId]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const request=useRef(null);
 const reservation=data?.reservations.find(r=>r.id===reservationId);
 if(!reservation) return <p>Reservation unavailable. Refresh and try again.</p>;
 const guest=data.guests.find(g=>g.id===reservation.guest_id), today=dayInZone(new Date(),property.timezone);
 const balance=Number(reservation.total_amount)-Number(reservation.paid_amount);
 const refundable=reservation.status==='CANCELLED' ? Number(reservation.paid_amount) : Math.max(0,-balance);
 const active=['PENDING','CHECKED_IN'].includes(reservation.status);
 const refund=refundSummary(reservation,data.payments);
 const payments=data.payments.filter(p=>p.reservation_id===reservation.id);
 const canCheckIn=reservation.status==='PENDING' && today>=reservation.check_in_date && today<reservation.check_out_date;
 const target=data.units.find(u=>u.id===targetId);
 let quote=null,quoteError='';
 if(panel==='move' && target) {
  try {
   const problem=destinationError(target,guest,data.allocations,reservation.id,from,to);
   if(problem) throw new Error(problem);
   quote=transferQuote(reservation,target,data.allocations,from,to);
  } catch(err) {quoteError=err.message;}
 }
 const open=type=>{
  setPanel(type);setError('');setMessage('');setNote('');
  if(type==='payment')setAmount((Math.max(0,balance)/100).toFixed(2));
  if(type==='refund')setAmount((refundable/100).toFixed(2));
  if(type==='move') {const start=today>=reservation.check_in_date && today<reservation.check_out_date ? today : reservation.check_in_date;setFrom(start);setTo(shiftDay(start,1));setTargetId('');}
 };
 const requestId=payload=>{const key=JSON.stringify(payload);if(request.current?.key!==key) request.current={key,id:crypto.randomUUID()};return request.current.id;};
 async function run(action,success) {
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try {await action();setPanel('');await refresh();setMessage(success);}
  catch(err){setError(databaseError(err));}finally{setBusy(false);}
 }
 function submitMoney(event) {
  event.preventDefault();
  let value;
  try {value=rupeesToPaise(amount);if(value<=0 || value>(panel==='refund'?refundable:balance))throw new Error('Amount exceeds the allowed balance.');}
  catch(err){setError(err.message);return;}
  const id=requestId([panel,reservation.id,value,method,note.trim()]);
  run(()=>panel==='refund'?recordRefund(reservation.id,value,method,note.trim(),id):recordPayment(reservation.id,value,method,note.trim(),id),panel==='refund'?'Refund recorded.':'Payment recorded.');
 }
 function submitMove(event) {
  event.preventDefault();if(!quote){setError(quoteError || 'Choose an available destination.');return;}
  const id=requestId(['move',reservation.id,targetId,from,to,quote.totalBefore,quote.newTotal]);
  run(()=>transferReservation(reservation.id,targetId,from,to,quote.totalBefore,quote.newTotal,id),'Booking moved and charges updated. Payment history was preserved.');
 }
 return <div className="management space-y-5">
  <div><p className="muted">{reservation.booking_ref}</p><div className="mt-1 flex flex-wrap justify-between gap-2"><h2>{guest?.full_name}</h2><span className="text-xs font-semibold">{reservation.status.replaceAll('_',' ')}</span></div><p className="muted mt-1">{guest?.phone} {guest?.email?' · '+guest.email:''}</p></div>
  <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="muted">Arrival</p><p>{reservation.check_in_date}</p></div><div><p className="muted">Departure</p><p>{reservation.check_out_date}</p></div></div>
  <div className="space-y-2">{data.allocations.filter(a=>a.reservationDbId===reservation.id).map(a=>{const u=data.units.find(u=>u.id===a.unitId);return <p key={a.id} className="muted">{u?.roomName} / {u?.label} · {a.checkInDate} → {a.checkOutDate}</p>;})}</div>
  {active && !panel && <div className="flex flex-wrap gap-2">{reservation.status==='PENDING' && <button className="primary" disabled={busy || !canCheckIn} title={canCheckIn?'Check in guest':'Check-in is available during the booked dates'} onClick={()=>run(()=>checkInReservation(reservation.id),'Guest checked in.')}>Check in guest</button>}<button className="secondary" disabled={busy} onClick={()=>open('edit')}>Edit reservation</button><button className="secondary" disabled={busy} onClick={()=>open('move')}>Move bed / room</button><button className="secondary text-red-600" disabled={busy} onClick={()=>open('cancel')}>Cancel reservation</button></div>}
  {reservation.status==='CANCELLED' && <div className="notice"><strong>Cancelled:</strong> {reservation.cancellation_reason}<p className="mt-2">Beds have been released. Recorded payments are retained; any refund must be recorded separately.</p></div>}
  {panel==='edit' && <EditReservation reservation={reservation} guest={guest} allocations={data.allocations} units={data.units} onSaved={refresh} onClose={()=>setPanel('')}/>}
  {(refund.pending>0 || refund.done>0) && <div className="notice"><strong>Refund {refund.status.toLowerCase()}</strong><p className="mt-2">Pending: {money(refund.pending)} · Returned: {money(refund.done)}</p><p className="muted mt-2">Use Record refund after returning the money. Partial refunds remain pending.</p></div>}
  <div className="rounded-xl border border-[#e7edf5] bg-[#f8faff] p-4"><div className="flex justify-between gap-2"><h2>Payment Details</h2><span className="text-xs font-semibold">{reservation.status==='CANCELLED'?'Cancelled':balance<0?'Refund due':balance===0?'Paid in full':Number(reservation.paid_amount)>0?'Partially paid':'Unpaid'}</span></div>
   <dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="muted">Total</dt><dd className="mt-1 font-semibold">{money(reservation.total_amount)}</dd></div><div><dt className="muted">Net paid</dt><dd className="mt-1 font-semibold text-emerald-600">{money(reservation.paid_amount)}</dd></div><div><dt className="muted">{reservation.status==='CANCELLED'?'Refund pending':balance<0?'Refund due':'Balance'}</dt><dd className="mt-1 font-semibold">{money(reservation.status==='CANCELLED'?refundable:Math.abs(balance))}</dd></div></dl>
   {!panel && <div className="mt-4 flex flex-wrap gap-2">{balance>0 && reservation.status!=='CANCELLED' && <><button onClick={()=>open('payment')} disabled={busy} className="primary">Add payment</button><button onClick={()=>open('payment')} disabled={busy} className="secondary">Mark balance as paid</button></>}{refundable>0 && <button className="secondary" disabled={busy} onClick={()=>open('refund')}>Record refund</button>}</div>}
  </div>
  {(panel==='payment' || panel==='refund') && <form onSubmit={submitMoney} className="rounded-xl border p-4"><fieldset disabled={busy} className="space-y-4"><h2>{panel==='refund'?'Record money refunded':'Record collected payment'}</h2><p className="muted">{panel==='refund'?'Only confirm money you have actually returned. This does not initiate a bank refund.':'Only confirm money already received.'}</p><label>Amount (INR)<input required type="number" min="0.01" max={((panel==='refund'?refundable:balance)/100).toFixed(2)} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Payment method<select value={method} onChange={e=>setMethod(e.target.value)}>{['CASH','UPI','CARD','BANK'].map(m=><option key={m}>{m}</option>)}</select></label><label>Reference / note<input maxLength={250} value={note} onChange={e=>setNote(e.target.value)}/></label><div className="flex justify-end gap-2"><button type="button" className="secondary" onClick={()=>setPanel('')}>Cancel</button><button className="primary">{busy?'Saving...':panel==='refund'?'Confirm refund returned':'Confirm payment received'}</button></div></fieldset></form>}
  {panel==='cancel' && <form onSubmit={e=>{e.preventDefault();run(()=>cancelReservation(reservation.id,reason.trim()),'Reservation cancelled and beds released.');}} className="rounded-xl border border-red-200 p-4"><fieldset disabled={busy} className="space-y-4"><h2>Cancel reservation?</h2><p className="muted">This releases every allocated bed/night. Recorded charges and payments stay in the history. If money was paid, the remaining paid amount will appear as a pending refund until it is recorded as returned.</p><label>Cancellation reason<textarea required minLength={3} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/><span className="muted">{reason.length}/250</span></label><div className="flex justify-end gap-2"><button type="button" className="secondary" onClick={()=>setPanel('')}>Keep reservation</button><button className="primary">{busy?'Cancelling...':'Confirm cancellation'}</button></div></fieldset></form>}
  {panel==='move' && <form onSubmit={submitMove} className="rounded-xl border p-4"><fieldset disabled={busy} className="space-y-4"><h2>Move and adjust charges</h2><div className="grid grid-cols-2 gap-3"><label>Move from<input required type="date" min={reservation.check_in_date} max={shiftDay(reservation.check_out_date,-1)} value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value>=to)setTo(shiftDay(e.target.value,1));}}/></label><label>Move until (checkout)<input required type="date" min={from?shiftDay(from,1):undefined} max={reservation.check_out_date} value={to} onChange={e=>setTo(e.target.value)}/></label></div><button type="button" className="secondary" onClick={()=>setTo(reservation.check_out_date)}>Select all nights from this date</button><label>Destination bed / room<select aria-label="Destination bed / room" required value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Choose a bed or private room</option>{data.units.map(u=>{const problem=destinationError(u,guest,data.allocations,reservation.id,from,to);return <option key={u.id} value={u.id} disabled={!!problem}>{u.roomName} / {u.label} · {money(u.nightlyRatePaise)}/night{problem?' — '+problem:''}</option>;})}</select></label>
   {quoteError && <p className="error">{quoteError}</p>}{quote && <div className="notice space-y-2"><p>Old total: {money(quote.totalBefore)} → New total: <strong>{money(quote.newTotal)}</strong></p><p>Already paid: {money(quote.paid)}</p><p>{quote.refund?'Refund due: '+money(quote.refund):'Balance due: '+money(quote.due)}</p><p>Only {from} to {to} moves. Other nights retain their charges. No payment or refund is automatically issued.</p></div>}<div className="flex justify-end gap-2"><button type="button" className="secondary" onClick={()=>setPanel('')}>Keep current bed</button><button disabled={!quote} className="primary">{busy?'Moving...':'Confirm move and price'}</button></div></fieldset></form>}
  {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
  <BookingWebCheckin reservation={reservation}/>
  <div><h2>Payment History</h2><div className="mt-3 overflow-x-auto"><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td>{new Date(p.paid_at).toLocaleString()}<p className="muted mt-1">{p.note}</p></td><td>{p.kind==='REFUND'?'Refund · ':''}{p.method==='OPENING'?'Opening / initial':p.method}</td><td>{p.kind==='REFUND'?'-':''}{money(p.amount_paise)}</td></tr>)}{!payments.length && <tr><td colSpan={3}>No payments recorded.</td></tr>}</tbody></table></div></div>
 </div>;
}
