import React, { useState } from 'react';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { moveError, nextDay } from '../utils/allocationMove';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { databaseError, transferReservation } from '../../../services/stayman';
import NewReservationModal from '../../../components/reservations/NewReservationModal';
import { Drawer } from '../../../components/ui/Drawer';
import  Modal  from '../../../components/ui/Modal';
import { transferQuote } from '../../reservations/utils/bookingActions';
import { money } from '../../management/utils/metrics';
import ReservationDetails from '../../reservations/components/ReservationDetails';

export default function AllocationPage() {
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [selectedStay, setSelectedStay] = useState(null);
  const { data, isPending, error: loadError, refresh } = usePropertyData();
  const { units = [], allocations = [] } = data || {};
  const activeStay = allocations.find(item => item.id === selectedStay?.id);
  const [moving, setMoving] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [dragId, setDragId] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [moveMessage, setMoveMessage] = useState('');

  function requestMove(stayId, unitId, day) {
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

  const days = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

  const handlePrev = () => setStartDate(addDays(startDate, -7));
  const handleNext = () => setStartDate(addDays(startDate, 7));

  const isOccupied = (unitId, date) => {
    return allocations.find((alloc) => {
      if (alloc.unitId !== unitId) return false;
      const checkIn = startOfDay(parseISO(alloc.checkInDate));
      const checkOut = startOfDay(parseISO(alloc.checkOutDate));
      const target = startOfDay(date);
      // Half-open interval [checkIn, checkOut)
      return target >= checkIn && target < checkOut;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bed Allocation Matrix</h1>
          <p className="text-sm text-slate-500">Drag a reservation to a free bed. Only the dropped night moves; confirm before moving.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
            <button onClick={handlePrev} className="p-2 hover:bg-slate-100 text-slate-600">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-800">
              {format(startDate, 'dd MMM yyyy')} - {format(days[6], 'dd MMM yyyy')}
            </span>
            <button onClick={handleNext} className="p-2 hover:bg-slate-100 text-slate-600">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setCreateModal({ isOpen: true, unitId: units[0]?.id, date: format(startDate, 'yyyy-MM-dd') })}
            disabled={!units.length} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Booking
          </button>
        </div>
      </div>

      {moveMessage && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{moveMessage}</p>}
      {isPending && <p>Loading allocations…</p>}
      {loadError && <div role="alert"><p className="text-red-600">{databaseError(loadError)}</p><button onClick={refresh} className="rounded-lg border p-2">Retry</button></div>}
      {!isPending && !loadError && !units.length && <p>No beds configured. Add units in Supabase or run the sample-data SQL.</p>}
      {/* Tape Chart Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="p-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600 sticky left-0 bg-slate-100 w-48 z-10">
                Unit / Bed
              </th>
              {days.map((day) => (
                <th key={day.toISOString()} className="p-3 text-center text-xs font-bold uppercase tracking-wider text-slate-600 min-w-[120px]">
                  {format(day, 'EEE')}<br />
                  <span className="text-sm font-semibold text-slate-900">{format(day, 'dd MMM')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {units.map((unit) => (
              <tr key={unit.id} className="hover:bg-slate-50/50">
                <td className="p-3 text-sm font-semibold text-slate-800 sticky left-0 bg-white border-r border-slate-200 z-10">
                  <div className="flex flex-col">
                    <span>{unit.label}</span>
                    <span className="text-xs font-normal text-slate-400">{unit.roomName} ({unit.category})</span>
                  </div>
                </td>
                {days.map((day) => {
                  const alloc = isOccupied(unit.id, day);
                  if (alloc) {
                    if (alloc.status === 'MAINTENANCE') {
                      return (
                        <td key={day.toISOString()} title={alloc.reason || "maintenance"} className="p-1 border border-dashed border-stone-400 bg-stone-100 text-stone-600 text-center text-xs">
                          <div className="rounded border border-dashed border-stone-400 p-2"><span className="font-semibold block">Maintenance</span><span className="block max-w-40 truncate">{alloc.reason || "maintenance"}</span></div>
                        </td>
                      );
                    }
                    const isCheckedIn = alloc.status === 'CHECKED_IN';
                    return (
                      <td
                        key={day.toISOString()}
                        draggable
                        onDragStart={event => { setDragId(alloc.id); event.dataTransfer.setData('text/plain', alloc.id); event.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => { if (!dragId) { setSelectedStay(alloc); setSelectedDay(format(day, 'yyyy-MM-dd')); } }}
                        className={`p-1 border border-slate-200 cursor-pointer transition-all ${
                          isCheckedIn ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-amber-50 border-amber-200 border-dashed text-amber-900'
                        }`}
                      >
                        <div className="p-1 rounded text-left">
                          <p className="text-xs font-bold truncate">{alloc.guestName}</p>
                          <p className="text-[10px] opacity-80">{alloc.status}</p>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={day.toISOString()}
                      onDragOver={event => {
                        const stay = allocations.find(item => item.id === dragId);
                        if (!moveError(stay, unit, allocations, units, format(day, 'yyyy-MM-dd'))) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
                      }}
                      onDrop={event => { event.preventDefault(); requestMove(event.dataTransfer.getData('text/plain'), unit.id, format(day, 'yyyy-MM-dd')); setDragId(null); }}
                      onClick={() => setCreateModal({ isOpen: true, unitId: unit.id, date: format(day, 'yyyy-MM-dd') })}
                      className="p-1 border border-slate-200 hover:bg-slate-100 cursor-pointer text-center text-slate-300 text-xs"
                    >
                      +
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
      <NewReservationModal isOpen={createModal.isOpen} units={units} allocations={allocations}
        defaultUnitId={createModal.unitId} defaultDate={createModal.date}
        onClose={() => setCreateModal({ isOpen: false, unitId: null, date: null })} onSaved={refresh} />
      <footer aria-label="Allocation color legend" className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <span className="font-semibold">Color guide</span>
        <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-emerald-300 bg-emerald-100" />Checked in</span>
        <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-dashed border-amber-300 bg-amber-50" />Pending check-in</span>
        <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-dashed border-stone-400 bg-stone-100" />Maintenance</span>
        <span className="flex items-center gap-2"><span className="h-4 w-6 rounded border border-slate-200 bg-white" />Available</span>
      </footer>
    </div>
  );
}
