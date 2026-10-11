import {extendQuote} from '../utils/extendQuote';
import {useRef,useState} from 'react';
import {extendStay,databaseError} from '../../../services/stayman';
import {money,shiftDay} from '../../management/utils/metrics';
import {destinationError} from '../utils/bookingActions';
export default function ExtendStay({reservation,guest,units,allocations,onSaved,onClose}){
 const last=allocations.find(a=>a.reservationDbId===reservation.id&&a.checkOutDate===reservation.check_out_date);
 const [unitId,setUnitId]=useState(last?.unitId||''),[depart,setDepart]=useState(shiftDay(reservation.check_out_date,1)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(null),target=units.find(u=>u.id===unitId);
 let problem=destinationError(target,guest,allocations,null,reservation.check_out_date,depart),quote=null;
 try{if(!problem)quote=extendQuote(reservation,target,depart);}catch(e){problem=e.message;}
 const extra=quote?.extra||0;
 async function submit(e){e.preventDefault();if(problem||busy)return;setBusy(true);setError('');try{
 const key=JSON.stringify([unitId,depart,reservation.check_out_date,reservation.total_amount,extra]);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
 await extendStay(reservation.id,unitId,depart,reservation.check_out_date,Number(reservation.total_amount),extra,request.current.id);await onSaved();onClose();
 }catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 return <form className="rounded-xl border p-4" onSubmit={submit}><fieldset disabled={busy} className="space-y-4"><h2>Extend stay</h2><p className="muted">Existing nights and payments stay recorded. Only additional nights are charged at the selected bed's current rate.</p><label>New departure<input required type="date" min={shiftDay(reservation.check_out_date,1)} value={depart} onChange={e=>setDepart(e.target.value)}/></label><label>Bed for added nights<select required value={unitId} onChange={e=>setUnitId(e.target.value)}><option value="">Choose available bed / room</option>{units.map(u=>{const err=destinationError(u,guest,allocations,null,reservation.check_out_date,depart);return <option key={u.id} value={u.id} disabled={!!err}>{u.roomName} / {u.label} · {money(u.nightlyRatePaise)}/night{err?' — '+err:''}</option>;})}</select></label>{problem?<p className="error">{problem}</p>:<div className="notice"><p>Added nights: {quote.duration} · Additional charge: {money(extra)}</p><p>New total: {money(quote.newTotal)}</p><p>Balance: {money(quote.balance)}</p></div>}{error&&<p role="alert" className="error">{error}</p>}<div className="flex gap-2"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!!problem}>Confirm extension & price</button></div></fieldset></form>;
}
