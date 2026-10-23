import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {adminRpc} from '../../../services/platformAdmin';
import {databaseError} from '../../../services/databaseErrors';
import {money,rupeesToPaise} from '../../management/utils/metrics';
export default function BookingClosure({reservation,kind,onSaved,onClose}){
 const [notice,setNotice]=useState(()=>new Date().toISOString()),[fee,setFee]=useState(''),[handler,setHandler]=useState(reservation.closure_money_handler||'PROPERTY'),[reason,setReason]=useState(''),[none,setNone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(null);
 const [externalReviewed,setExternalReviewed]=useState(false);
 const query=useQuery({queryKey:['closure-quote',reservation.id,kind,notice],queryFn:()=>adminRpc('stayman_closure_quote',{p_reservation:reservation.id,p_kind:kind,p_notice:notice}),retry:false});
 useEffect(()=>{if(query.data)setFee(query.data.closed?(query.data.current_fee/100).toFixed(2):query.data.fee==null?'':(query.data.fee/100).toFixed(2));},[query.data]);
 const q=query.data;
 let amount=null;try{amount=rupeesToPaise(fee);}catch{/* validation at confirmation */}
 const refund=amount==null?0:Math.max(0,Number(q?.received||0)-amount),due=amount==null?0:Math.max(0,amount-Number(q?.received||0));
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const p_fee=rupeesToPaise(fee),payload={p_reservation:reservation.id,p_kind:kind,p_notice:q.notice,p_fee,p_handler:handler,p_reason:reason.trim(),p_none_arrived:none,p_external_review:externalReviewed,p_expected:q};
  const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  await adminRpc('stayman_close_booking',{...payload,p_request:request.current.id});await onSaved();onClose();
 }catch(err){setError(databaseError(err));await query.refetch();}finally{setBusy(false);}}
 const local=notice?new Date(new Date(notice).getTime()-new Date(notice).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 return <form onSubmit={submit} className="rounded-xl border p-4 space-y-4"><h2>{kind==='NO_SHOW'?'Mark whole booking no-show':'Cancel booking & review settlement'}</h2>{query.error?<p role="alert" className="error">{databaseError(query.error)}</p>:!q?<p>Loading saved policy…</p>:<fieldset className="space-y-4" disabled={busy}>
 <p className="notice">This closes the whole booking and releases its room/bed allocations. No money is transferred. {kind==='NO_SHOW'?'Use this only if none of the booked guests arrived.':'If the guest stayed, use checkout instead.'}</p>
 <p className="muted">Saved policy: {q.policy?.policy?.name||'Not available — owner must confirm the applicable fee.'}{q.channel_booking?' OTA terms and payment handling require owner review. Cancelling here or changing the fee does not cancel/refund the OTA booking; confirm that separately with the provider.':''}</p>
 {q.owner&&<label>Guest notification time (your device’s local time)<input type="datetime-local" value={local} onChange={e=>{if(e.target.value)setNotice(new Date(e.target.value).toISOString());}}/></label>}
 <div className="billing-totals"><div><small>Booking total</small><strong>{money(q.total)}</strong></div><div><small>Net received in Stayman</small><strong>{money(q.received)}</strong></div><div><small>Policy fee</small><strong>{q.fee==null?'Owner review':money(q.fee)}</strong></div></div>
 <label>Fee retained / charged (INR)<input required type="number" min="0" max={q.total/100} step="0.01" value={fee} readOnly={!q.owner} onChange={e=>setFee(e.target.value)}/></label>
 <p className="notice">Refund due: <strong>{money(refund)}</strong> · Fee outstanding: <strong>{money(due)}</strong>. Refunds stay pending until recorded as returned.</p>
 <label>Who handles the money?<select disabled={!q.owner} value={handler} onChange={e=>setHandler(e.target.value)}><option value="PROPERTY">Property — record actual receipts / refunds here</option><option value="EXTERNAL">OTA / payment provider — record external confirmation</option></select></label>
 {handler==='EXTERNAL'&&<p className="muted">This does not refund or charge through an OTA. Do not record provider payouts as guest cash receipts.</p>}
 {q.channel_booking&&<label className="flex gap-2 items-start"><input type="checkbox" required checked={externalReviewed} onChange={e=>setExternalReviewed(e.target.checked)}/>I verified the provider booking policy and separately handled any external fee waiver or refund. Stayman does not change those terms.</label>}
 <label>Reason / policy exception<input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 {kind==='NO_SHOW'&&<label className="flex gap-2 items-start"><input type="checkbox" required checked={none} onChange={e=>setNone(e.target.checked)}/>I confirmed that none of the guests in this booking arrived. This is not a partial group no-show.</label>}
 <button className="primary" disabled={query.isFetching||amount==null||(!q.owner&&(q.fee==null||q.closed||q.channel_booking))}>{busy?'Saving…':kind==='NO_SHOW'?'Confirm no-show & settlement':'Confirm cancellation & settlement'}</button>
 </fieldset>}{error&&<p role="alert" className="error">{error}</p>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>Keep booking unchanged</button></form>;
}
