import {useState} from 'react';
import Modal from '../../../components/ui/Modal';
import {db,databaseError} from '../../../services/stayman';
import {shiftDay,nights} from '../../management/utils/metrics';
export default function BlockBedModal({units,allocations,start,onClose,onSaved}){
 const [unitId,setUnitId]=useState(units[0]?.id||''),[from,setFrom]=useState(start),[to,setTo]=useState(shiftDay(start,1)),[reason,setReason]=useState('Maintenance');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const overlaps=id=>allocations.some(a=>a.unitId===id&&a.checkInDate<to&&a.checkOutDate>from);
 async function save(event){
  event.preventDefault();if(busy)return;setError('');
  if(!from||!to||to<=from||nights(from,to)>366){setError('Choose a block of 1–366 nights.');return;}
  if(overlaps(unitId)){setError('This unit is already reserved or blocked for some selected nights.');return;}
  setBusy(true);
  try{const {error}=await db().rpc('stayman_block_unit',{p_unit:unitId,p_from:from,p_to:to,p_reason:reason.trim()});if(error)throw error;await onSaved();onClose();}
  catch(err){setError(err.code==='PGRST202'?'Apply migration 016 to enable date-range bed blocking.':databaseError(err));}finally{setBusy(false);}
 }
 return <Modal isOpen onClose={()=>{if(!busy)onClose();}} title="Block bed / room"><form className="management" onSubmit={save}><fieldset disabled={busy} className="space-y-4"><p className="muted">Keep this unit out of sale for maintenance or other property use.</p><label>Bed / room<select required value={unitId} onChange={event=>setUnitId(event.target.value)}>{units.map(unit=><option value={unit.id} key={unit.id}>{unit.roomName} / {unit.label}{overlaps(unit.id)?' — unavailable for these dates':''}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label>From<input type="date" required value={from} onChange={event=>{setFrom(event.target.value);if(event.target.value>=to)setTo(shiftDay(event.target.value,1));}}/></label><label>Available again<input type="date" required min={from?shiftDay(from,1):undefined} value={to} onChange={event=>setTo(event.target.value)}/></label></div><label>Reason<input required minLength={1} maxLength={50} value={reason} onChange={event=>setReason(event.target.value)}/></label><p className="muted">The unit is blocked on each night from the start date up to, but excluding, “Available again”.</p>{error&&<p role="alert" className="error">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!unitId||overlaps(unitId)}>{busy?'Blocking...':'Confirm block'}</button></div></fieldset></form></Modal>;
}
