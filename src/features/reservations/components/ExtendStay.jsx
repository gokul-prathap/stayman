import {CalendarPlus,Check,ChevronDown} from 'lucide-react';
import './extend-stay.css';
import {extendQuote} from '../utils/extendQuote';
import {useRef,useState} from 'react';
import {extendStay,databaseError} from '../../../services/stayman';
import {money,shiftDay} from '../../management/utils/metrics';
import {destinationError} from '../utils/bookingActions';
import {usePropertyData} from '../hooks/usePropertyData';
export default function ExtendStay({reservation,guest,units:initialUnits,allocations:initialAllocations,onSaved,onClose,initialDeparture,initialUnitId}){
 const last=initialAllocations.find(a=>a.reservationDbId===reservation.id&&a.checkOutDate===reservation.check_out_date);
 const [unitId,setUnitId]=useState(initialUnitId||last?.unitId||''),[depart,setDepart]=useState(initialDeparture||shiftDay(reservation.check_out_date,1)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const availability=usePropertyData({mode:'availability',from:reservation.check_out_date,to:depart,enabled:depart>reservation.check_out_date});
 const units=availability.data?.units||initialUnits,allocations=availability.data?.allocations||initialAllocations;
 const request=useRef(null),target=units.find(u=>u.id===unitId);
 let problem=destinationError(target,guest,allocations,null,reservation.check_out_date,depart),quote=null;
 if(availability.isPending||availability.error)problem=availability.error?databaseError(availability.error):'Checking added-night availability...';
 try{if(!problem)quote=extendQuote(reservation,target,depart);}catch(e){problem=e.message;}
 const extra=quote?.extra||0;
 const unavailable=units.map(unit=>({unit,reason:destinationError(unit,guest,allocations,null,reservation.check_out_date,depart)})).filter(item=>item.reason);
 async function submit(e){e.preventDefault();if(problem||busy)return;setBusy(true);setError('');try{
 const key=JSON.stringify([unitId,depart,reservation.check_out_date,reservation.total_amount,extra]);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
 await extendStay(reservation.id,unitId,depart,reservation.check_out_date,Number(reservation.total_amount),extra,request.current.id);await onSaved();onClose();
 }catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 return <form className="management extend-stay-form" onSubmit={submit}><fieldset disabled={busy} className="space-y-4"><h2 className="flex items-center gap-2"><CalendarPlus size={18} aria-hidden="true"/>Extend stay</h2><p className="muted">Existing nights and payments stay recorded. Only additional nights are charged at the selected bed's current rate.</p><label>New departure<input required type="date" min={shiftDay(reservation.check_out_date,1)} value={depart} onChange={e=>setDepart(e.target.value)}/></label><div className="extend-bed-field"><span id="extend-bed-label" className="extend-bed-label">Bed for added nights</span><details className="extend-bed-picker"><summary aria-labelledby="extend-bed-label extend-bed-value"><span id="extend-bed-value">{target?target.roomName+' / '+target.label+' - '+money(target.nightlyRatePaise)+'/night':'Choose available bed / room'}</span><ChevronDown size={16} aria-hidden="true"/></summary><div className="extend-bed-options" role="group" aria-label="Choose bed for added nights">{units.map(u=>{const unavailableReason=destinationError(u,guest,allocations,null,reservation.check_out_date,depart);return <button type="button" key={u.id} disabled={!!unavailableReason} aria-pressed={unitId===u.id} className="extend-bed-option" onClick={event=>{setUnitId(u.id);const picker=event.currentTarget.closest('details');picker.open=false;picker.querySelector('summary').focus();}}><span className={unavailableReason?'extend-unavailable-name':''}>{u.roomName} / {u.label}</span><small>{unavailableReason?'Unavailable':money(u.nightlyRatePaise)+'/night'}</small>{unitId===u.id&&<Check size={15} aria-hidden="true"/>}</button>;})}</div></details></div>{unavailable.length>0&&<details className="extend-unavailable"><summary>Unavailable beds / rooms ({unavailable.length})</summary><ul>{unavailable.map(({unit,reason})=><li key={unit.id}><span className="extend-unavailable-name">{unit.roomName} / {unit.label}</span><span className="block">{reason}</span></li>)}</ul></details>}{problem?<p className="error">{problem}</p>:<div className="notice"><p>Added nights: {quote.duration} · Additional charge: {money(extra)}</p><p>New total: {money(quote.newTotal)}</p><p>Balance: {money(quote.balance)}</p></div>}{error&&<p role="alert" className="error">{error}</p>}<div className="extend-stay-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!!problem}><Check size={16} aria-hidden="true"/>{busy?'Saving...':'Confirm extension'}</button></div></fieldset></form>;
}
