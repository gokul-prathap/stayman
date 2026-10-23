import {genderOptions} from '../../services/guestGender';
import './maintenance-switch.css';
import PhoneInput from '../../features/rooms/components/PhoneInput';
import {phoneCountry} from '../../features/rooms/utils/phoneInput';
import {getCountryCallingCode,parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {usePropertyData} from '../../features/reservations/hooks/usePropertyData';
import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { createBooking, databaseError, db } from '../../services/stayman';
import { nextDay } from '../../features/allocation/utils/allocationMove';
import { defaultBookingStatus, destinationError } from '../../features/reservations/utils/bookingActions';
import { useStaff } from '../auth/StaffGate';
import { nights, dayInZone, rupeesToPaise, money } from '../../features/management/utils/metrics';
export default function NewReservationModal({ isOpen, onClose, units:initialUnits = [], allocations:initialAllocations = [], defaultUnitId, defaultDate, defaultCheckinId, onSaved }) {
  const { property } = useStaff();
  const today = dayInZone(new Date(),property.timezone);
  const [manualStatus,setManualStatus] = useState(false);
  const [form, setForm] = useState({});
  const from=form.checkInDate||defaultDate||today,to=form.checkOutDate||nextDay(from);
  const {data,refresh,refetch,isFetching,error:availabilityError}=usePropertyData({mode:'booking',from,to,enabled:isOpen&&to>from});
  const units=data?.units||initialUnits,allocations=data?.allocations||initialAllocations,walkins=data?.walkins||[];
  const [manualTotal,setManualTotal] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [reason, setReason] = useState('maintenance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    const arrival=defaultDate||today;
    const availableDefault=units.find(unit=>!destinationError(unit,{gender:'OTHER'},allocations,null,arrival,nextDay(arrival)));
    setForm({ unitId: defaultUnitId || availableDefault?.id || '', guestName: '', phone: '', phoneCountry:'IN', webCheckinId:'', email: '', gender: 'NOT_PROVIDED', nationality: 'India',
      checkInDate: defaultDate || today, checkOutDate: nextDay(defaultDate || today), status: defaultBookingStatus(defaultDate || today,today), total: '0', paid: '0', source: 'Direct Booking', notes: '' });
    setManualStatus(false); setManualTotal(false); setMaintenance(false); setReason('maintenance'); setError('');
  }, [isOpen, defaultUnitId, defaultDate]);
  useEffect(() => {
    if (!manualStatus && form.checkInDate) setForm(previous => ({ ...previous,status:defaultBookingStatus(previous.checkInDate,today) }));
  },[form.checkInDate,manualStatus,today]);
  const selectedUnit = units.find(u => u.id === form.unitId);
  useEffect(() => {
    if (!manualTotal && form.checkInDate && form.checkOutDate && form.checkOutDate > form.checkInDate) {
      const total = ((selectedUnit?.nightlyRatePaise || 0) * nights(form.checkInDate,form.checkOutDate) / 100).toFixed(2);
      setForm(previous => previous.total === total ? previous : { ...previous,total });
    }
  }, [manualTotal,form.unitId,form.checkInDate,form.checkOutDate,selectedUnit?.nightlyRatePaise]);
  const change = (key,value) => {
    setError('');
    if (key === 'status') setManualStatus(true);
    if (key === 'total') setManualTotal(true);
    setForm(previous => ({ ...previous,[key]:value,
      ...(key === 'checkInDate' && value && previous.checkOutDate <= value ? {checkOutDate:nextDay(value)} : {}) }));
  };
  useEffect(() => {
    if (form.unitId && !units.some(u => u.id===form.unitId)) setForm(previous=>({...previous,unitId:''}));
  },[units.map(u=>u.id).join(','),form.unitId]);
  function selectWalkin(id) {
    const w=walkins.find(w=>w.id===id),d=w?.details;
    if(!d){setForm(previous=>({...previous,webCheckinId:'',guestName:'',phone:'',phoneCountry:'IN',email:'',gender:'NOT_PROVIDED'}));return;}
    setManualStatus(false);setManualTotal(false);
    setForm(previous=>({...previous,webCheckinId:id,guestName:d.full_name,phone:d.phone,phoneCountry:phoneCountry(d.phone),email:d.email,gender:d.gender||'NOT_PROVIDED',
      nationality:d.foreign_guest?'International':'India',checkInDate:d.arrival_date,checkOutDate:d.departure_date,
      status:defaultBookingStatus(d.arrival_date,today)}));
  }
  useEffect(()=>{if(isOpen && defaultCheckinId && !form.webCheckinId && walkins.some(w=>w.id===defaultCheckinId))selectWalkin(defaultCheckinId);},[isOpen,defaultCheckinId,walkins]);
  async function save(event) {
    event.preventDefault(); if(busy)return;setError('');
    if (!form.unitId) { setError('Choose a bed or room.'); return; }
    if(maintenance&&(!form.checkInDate||!form.checkOutDate||form.checkOutDate<=form.checkInDate||nights(form.checkInDate,form.checkOutDate)>366)){setError('Choose a maintenance range of 1-366 nights.');return;}
    if (!maintenance && (!form.guestName.trim() || form.checkOutDate <= form.checkInDate || Number(form.paid) > Number(form.total))) {
      setError('Check the guest name, departure date and payment amounts.'); return;
    }
    if (!maintenance && form.status==='CHECKED_IN' && (form.checkInDate>today || form.checkOutDate<=today)) {
      setError('Walk-in dates must include today. Choose reserved / awaiting arrival for advance bookings.');return;
    }
    if(!maintenance && !parsePhoneNumberFromString(form.phone||'')?.isValid()){setError('Enter a valid phone number for the selected country.');return;}
    setBusy(true);
    try {
      const latest=await refetch();
      if(latest.error)throw latest.error;
      if(!latest.data)throw new Error('Could not check current availability. Refresh and try again.');
      const currentUnit=latest.data.units.find(unit=>unit.id===form.unitId);
      const unavailable=destinationError(currentUnit,maintenance?null:{gender:form.gender},latest.data.allocations,null,form.checkInDate,form.checkOutDate);
      if(unavailable)throw new Error(unavailable);
      if (maintenance) {const result=await db().rpc('stayman_block_unit',{p_unit:form.unitId,p_from:form.checkInDate,p_to:form.checkOutDate,p_reason:reason.trim()});if(result.error)throw result.error;}
      else await createBooking(form.unitId, { ...form, guestName: form.guestName.trim(),
        totalAmountPaise: rupeesToPaise(form.total), paidAmountPaise: rupeesToPaise(form.paid) });
      onClose(); await refresh(); await onSaved?.();
    } catch (err) {
      if(err.code==='23P01')await refresh();
      setError(databaseError(err));
    } finally { setBusy(false); }
  }
  const selectedAvailability=selectedUnit&&form.checkInDate?destinationError(selectedUnit,maintenance?null:{gender:form.gender},allocations,null,form.checkInDate,form.checkOutDate):'';
  const input = (key, label, type = 'text', extra = {}) => <label className="block text-sm font-medium">{label}<input {...extra} type={type} value={form[key] || ''} onChange={e => change(key, e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2" /></label>;
  return <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose(); }} title={maintenance ? 'Mark bed as maintenance' : 'Create Reservation / Walk-In'}>
    <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <div className="maintenance-mode-row"><span id="maintenance-mode-label">Mark as maintenance</span><button type="button" role="switch" aria-checked={maintenance} aria-labelledby="maintenance-mode-label" className="maintenance-mode-switch" onClick={()=>{setMaintenance(value=>!value);setError('');}}><span/></button></div>
      {!maintenance && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><label className="block text-sm font-medium">Available web check-in guests<select aria-label="Available web check-in guests" value={form.webCheckinId||''} onChange={e=>selectWalkin(e.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="">New guest / enter details manually</option>{walkins.map(w=><option key={w.id} value={w.id}>{w.details.full_name} · {w.details.phone} · {w.details.arrival_date}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">{walkins.length?'Select a submitted walk-in to prefill details and link their ID when saving.':'No unallocated web check-ins yet. New submissions appear here.'}</p></div>}
      <label className="block text-sm font-medium">Bed / room<select aria-label="Bed / room" required value={form.unitId || ''} onChange={e => change('unitId', e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border p-2"><option value="">Select bed or room</option>{units.map(u => {
        const unavailable=destinationError(u,maintenance ? null : {gender:form.gender},allocations,null,form.checkInDate,form.checkOutDate);
        return <option key={u.id} value={u.id} disabled={!!unavailable}>{u.roomName} / {u.label} ({u.type === 'ROOM' ? 'Private room' : 'Dorm bed'}){unavailable ? ' — '+unavailable : ''}</option>;
      })}</select></label>
      {!units.length && <p role="alert" className="text-sm text-red-600">No beds or rooms are configured for this property. Add stayman_units in Supabase; demo rooms on older screens are not bookable inventory.</p>}
      <p className="text-xs text-slate-500">Occupied beds and incompatible rooms are shown disabled. Change dates or guest gender to see available options.</p>
      {input('checkInDate', maintenance ? 'Maintenance from' : 'Arrival date', 'date', { required: true })}
      {maintenance&&input('checkOutDate','Available again','date',{required:true,min:form.checkInDate?nextDay(form.checkInDate):undefined})}
      {maintenance&&<p className="text-xs text-slate-500">Blocked from the start date up to, but excluding, Available again.</p>}
      {maintenance ? <label className="block text-sm font-medium">Description<input required maxLength={50} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /><span className="mt-1 block text-right text-xs text-slate-500" aria-live="polite">{reason.length}/50 characters</span></label> : <>
        {input('checkOutDate', 'Departure date', 'date', { required: true, min: form.checkInDate ? nextDay(form.checkInDate) : undefined })}
        {input('guestName', 'Full name', 'text', { required: true, minLength: 2, maxLength: 100 })}
        <PhoneInput required country={form.phoneCountry||'IN'} value={form.phone||''} onChange={value=>change('phone',value)} onCountryChange={(country,national)=>setForm(previous=>({...previous,phoneCountry:country,phone:'+'+getCountryCallingCode(country)+national}))}/>

        {input('email', 'Email (optional)', 'email', { maxLength: 254 })}
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Gender<select value={form.gender || 'NOT_PROVIDED'} onChange={e => change('gender', e.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="NOT_PROVIDED">Not provided</option>{form.gender==='OTHER'&&<option value="OTHER">Other / unspecified (legacy)</option>}{genderOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{input('nationality', 'Nationality', 'text', { maxLength: 100 })}</div>
        <label className="block text-sm">Status<select aria-label="Status" value={form.status || 'PENDING'} onChange={e => change('status', e.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="PENDING">Reserved / awaiting arrival</option><option value="CHECKED_IN" disabled={!form.checkInDate || form.checkInDate > today || form.checkOutDate <= today}>Walk-in / checked in</option></select></label>
        <div className="grid grid-cols-2 gap-3">{input('total', 'Total (₹)', 'number', { required: true, min: 0, step: '0.01' })}{input('paid', 'Paid (₹)', 'number', { required: true, min: 0, max: form.total, step: '0.01' })}</div>
        <p className="text-xs text-slate-500">Saved nightly rate: {money(selectedUnit?.nightlyRatePaise)}. {manualTotal ? 'Custom total entered.' : 'Total calculated from the saved rate.'} <button type="button" className="font-semibold text-blue-600 underline" onClick={() => setManualTotal(false)}>Use saved rate</button></p>
        {input('source', 'Booking source', 'text', { maxLength: 100 })}{input('notes', 'Notes', 'text', { maxLength: 1000 })}
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {selectedAvailability&&<p role="status" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{selectedAvailability}</p>}{availabilityError&&<p role="alert" className="text-sm text-red-700">Availability could not be refreshed. Please try again.</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-4">Cancel</button><button type="submit" disabled={!!selectedAvailability||isFetching||!!availabilityError} className="min-h-11 rounded-lg bg-brand-600 px-4 text-white">{busy ? 'Saving…' : maintenance ? 'Mark maintenance' : 'Save reservation'}</button></div>
    </fieldset></form>
  </Modal>;
}
