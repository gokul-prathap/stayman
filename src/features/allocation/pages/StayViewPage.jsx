import AppLoader from '../../../components/ui/AppLoader';
import React, { useMemo, useState } from 'react';
import {useStaff} from '../../../components/auth/StaffGate';
import StayChart from '../components/StayChart';
import BlockBedModal from '../components/BlockBedModal';
import {stayDays} from '../utils/stayView';
import '../../management/management.css';
import './stay-view.css';
import { BedDouble, ChevronLeft, ChevronRight, Plus, RefreshCw, ShieldOff } from 'lucide-react';
import { moveError, nextDay } from '../utils/allocationMove';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { databaseError, transferReservation, releaseMaintenance } from '../../../services/stayman';
import NewReservationModal from '../../../components/reservations/NewReservationModal';
import { Drawer } from '../../../components/ui/Drawer';
import  Modal  from '../../../components/ui/Modal';
import { transferQuote } from '../../reservations/utils/bookingActions';
import { money, dayInZone, shiftDay } from '../../management/utils/metrics';
import ReservationDetails from '../../reservations/components/ReservationDetails';

export default function StayViewPage() {
  const {property}=useStaff();
  const today=dayInZone(new Date(),property.timezone);
  const [startDate,setStartDate]=useState(today),[dayCount,setDayCount]=useState(7),[blockOpen,setBlockOpen]=useState(false);
  const [selectedStay, setSelectedStay] = useState(null);
  const { data, isPending, error: loadError, refresh } = usePropertyData({refetchInterval:30000});
  const { units = [], allocations = [] } = data || {};
  const activeStay = allocations.find(item => item.id === selectedStay?.id);
  const [moving, setMoving] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [dragId, setDragId] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [moveMessage, setMoveMessage] = useState('');
  const [maintenance,setMaintenance]=useState(null);
  const [releaseError,setReleaseError]=useState('');

  function requestMove(stayId, unitId, day) {
    if(moving)return;
    const stay = allocations.find(item => item.id === stayId);
    const target = units.find(item => item.id === unitId);
    const error = moveError(stay, target, allocations, units, day);
    if (error) { setMoveMessage(error); return; }
    try {
      const reservation = data.reservations.find(r => r.id === stay.reservationDbId);
      const quote = transferQuote(reservation,target,allocations,day,nextDay(day));
      setMoveMessage(''); setPendingMove({ stay,target,day,quote,request:crypto.randomUUID() }); setSelectedStay(null);
    } catch(error) { setMoveMessage(error.message); }
  }
  async function confirmMove() {
    if (moving || !pendingMove) return;
    const { stay, target, day, quote, request } = pendingMove;
    setMoving(true);
    try {
      await transferReservation(stay.reservationDbId,target.id,day,nextDay(day),quote.totalBefore,quote.newTotal,request);
      setPendingMove(null);
      setMoveMessage(stay.guestName + ' moved for ' + day + ' only.');
      await refresh();
    } catch (error) { setMoveMessage(databaseError(error)); }
    finally { setMoving(false); }
  }
  const [createModal, setCreateModal] = useState({ isOpen: false, unitId: null, date: null });

  const days=useMemo(()=>stayDays(startDate,dayCount),[startDate,dayCount]);
  const dateLabel=day=>new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  return (
    <section className="management stay-view">
      <header className="stay-view-heading"><div className="stay-view-title"><span><BedDouble size={23}/></span><div><h1>Stay View</h1><p>Stays, availability and blocked units · {property.name}</p></div></div></header>
      <div className="stay-toolbar"><div className="stay-date-nav"><button type="button" aria-label="Previous date range" onClick={()=>setStartDate(shiftDay(startDate,-dayCount))}><ChevronLeft size={16}/></button><button type="button" aria-label="Next date range" onClick={()=>setStartDate(shiftDay(startDate,dayCount))}><ChevronRight size={16}/></button></div><button type="button" onClick={()=>setStartDate(today)}>Today</button><span className="stay-range">{dateLabel(days[0])} – {dateLabel(days[days.length-1])}</span><input className="stay-date-picker" aria-label="Stay view start date" type="date" value={startDate} onChange={event=>{if(event.target.value)setStartDate(event.target.value);}}/><label className="stay-period-label">View<select aria-label="View duration" value={dayCount} onChange={event=>setDayCount(Number(event.target.value))}><option value={7}>1 week</option><option value={14}>2 weeks</option><option value={28}>4 weeks</option></select></label><button type="button" aria-label="Refresh stay view" onClick={refresh}><RefreshCw size={15}/></button><div className="stay-actions"><button type="button" disabled={!units.length||!!loadError} onClick={()=>setBlockOpen(true)}><ShieldOff size={15}/>Block bed</button><button type="button" className="stay-primary" disabled={!units.length||!!loadError} onClick={()=>setCreateModal({isOpen:true,unitId:null,date:startDate})}><Plus size={15}/>New booking</button></div></div>
      {moveMessage&&<p role="status" className="notice">{moveMessage}</p>}
      {isPending&&<AppLoader label="Loading stays..."/>}
      {loadError&&<div role="alert" className="error">{databaseError(loadError)} <button type="button" onClick={refresh}>Retry</button></div>}
      {data&&!loadError&&<StayChart data={data} days={days} today={today} onBook={(unitId,date)=>setCreateModal({isOpen:true,unitId,date})} onStay={(stay,day)=>{setSelectedStay(stay);setSelectedDay(day);}} onRelease={allocation=>{setMaintenance(allocation);setReleaseError('');}} onMove={requestMove} moveProblem={(stayId,unitId,day)=>moveError(allocations.find(a=>a.id===stayId),units.find(u=>u.id===unitId),allocations,units,day)} dragId={dragId} onDragChange={setDragId}/>}
      {data&&!loadError&&!units.length&&<p className="notice">No rooms or beds configured for this property yet.</p>}
      {blockOpen&&<BlockBedModal units={units} allocations={allocations} start={startDate} onClose={()=>setBlockOpen(false)} onSaved={async()=>{await refresh();setMoveMessage('Bed / room blocked for the selected nights.');}}/>}
      {/* Stay Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedStay)}
        onClose={() => setSelectedStay(null)}
        title="Reservation Details"
      >
        {selectedStay && <div className="space-y-4">
          {activeStay && <div><label className="block text-sm font-medium" htmlFor="move-bed">Move this night ({selectedDay})</label>
            <select id="move-bed" value="" onChange={e=>{if(e.target.value)requestMove(activeStay.id,e.target.value,selectedDay);}} className="mt-2 min-h-11 w-full rounded-lg border p-2">
              <option value="">Choose a bed or private room</option>
              {units.map(unit=>{const problem=moveError(activeStay,unit,allocations,units,selectedDay);return <option key={unit.id} value={unit.id} disabled={!!problem}>{unit.roomName} / {unit.label}{problem?' — '+problem:''}</option>;})}
            </select>
          </div>}
          <ReservationDetails key={selectedStay.reservationDbId} reservationId={selectedStay.reservationDbId}/>
        </div>}
      </Drawer>

      <Modal isOpen={!!pendingMove} onClose={() => { if (!moving) setPendingMove(null); }} title="Confirm reservation move">
        {pendingMove && <div className="space-y-4">
          <p className="text-sm text-slate-700">Move <strong>{pendingMove.stay.guestName}</strong> from <strong>{units.find(unit => unit.id === pendingMove.stay.unitId)?.label}</strong> to <strong>{pendingMove.target.roomName} / {pendingMove.target.label}</strong>?</p>
          <p className="text-sm text-slate-500">{pendingMove.day} to {nextDay(pendingMove.day)} — one night only. Other nights remain on their assigned bed.</p>
          <div className="rounded-lg bg-blue-50 p-3 text-sm"><p>Total: {money(pendingMove.quote.totalBefore)} → {money(pendingMove.quote.newTotal)}</p><p>Already paid: {money(pendingMove.quote.paid)}</p><p>{pendingMove.quote.refund ? 'Refund due: '+money(pendingMove.quote.refund) : 'Balance due: '+money(pendingMove.quote.due)}</p><p className="mt-2 text-xs">Paid amounts stay recorded. No money is automatically refunded or collected.</p></div>
          <div className="flex justify-end gap-3"><button className="min-h-11 rounded-lg border px-4" disabled={moving} onClick={() => setPendingMove(null)}>Cancel</button><button className="min-h-11 rounded-lg bg-brand-600 px-4 text-white" disabled={moving} onClick={confirmMove}>{moving ? "Moving…" : "Confirm move"}</button></div>
        </div>}
      </Modal>
      <Modal isOpen={!!maintenance} onClose={()=>{if(!moving)setMaintenance(null);}} title="Release maintenance">
       {maintenance&&<div className="space-y-4"><p>Make this bed available again?</p><p className="text-sm text-slate-500">{units.find(u=>u.id===maintenance.unitId)?.label} · {maintenance.checkInDate} to {maintenance.checkOutDate} · {maintenance.reason}</p><p className="text-sm">This releases the entire selected maintenance block.</p>{releaseError&&<p role="alert" className="text-red-600">{releaseError}</p>}<div className="flex gap-2"><button disabled={moving} className="rounded-lg border px-4 py-2" onClick={()=>setMaintenance(null)}>Keep maintenance</button><button disabled={moving} className="rounded-lg bg-brand-600 px-4 py-2 text-white" onClick={async()=>{setMoving(true);setReleaseError('');try{await releaseMaintenance(maintenance.id);setMaintenance(null);await refresh();setMoveMessage('Maintenance released. Bed is available.');}catch(e){setReleaseError(databaseError(e));}finally{setMoving(false);}}}>{moving?'Releasing...':'Confirm release'}</button></div></div>}
      </Modal>
      <NewReservationModal isOpen={createModal.isOpen} units={units} allocations={allocations}
        defaultUnitId={createModal.unitId} defaultDate={createModal.date}
        onClose={() => setCreateModal({ isOpen: false, unitId: null, date: null })} onSaved={refresh} />

    </section>
  );
}
