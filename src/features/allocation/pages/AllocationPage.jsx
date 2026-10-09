import React, { useState } from 'react';
import { addDays, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { MOCK_UNITS, MOCK_ALLOCATIONS } from '../data/mockAllocationData';
import { Drawer } from '../../../components/ui/Drawer';
import  Modal  from '../../../components/ui/Modal';
import  Badge  from '../../../components/ui/Badge';
import { formatCurrency } from '../../../utils/Formatters';

export default function AllocationPage() {
  const [startDate, setStartDate] = useState(new Date('2026-09-29T00:00:00'));
  const [selectedStay, setSelectedStay] = useState(null);
  const [createModal, setCreateModal] = useState({ isOpen: false, unitId: null, date: null });

  const days = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

  const handlePrev = () => setStartDate(addDays(startDate, -7));
  const handleNext = () => setStartDate(addDays(startDate, 7));

  const isOccupied = (unitId, date) => {
    return MOCK_ALLOCATIONS.find((alloc) => {
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
          <p className="text-sm text-slate-500">7-Day operational tape chart</p>
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
            onClick={() => setCreateModal({ isOpen: true, unitId: MOCK_UNITS[0].id, date: format(startDate, 'yyyy-MM-dd') })}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Booking
          </button>
        </div>
      </div>

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
            {MOCK_UNITS.map((unit) => (
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
                        <td key={day.toISOString()} className="p-1 border border-slate-200 bg-stone-100 text-stone-600 text-center text-xs">
                          <span className="font-semibold block truncate">Maintenance</span>
                        </td>
                      );
                    }
                    const isCheckedIn = alloc.status === 'CHECKED_IN';
                    return (
                      <td 
                        key={day.toISOString()} 
                        onClick={() => setSelectedStay(alloc)}
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
        {selectedStay && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b">
              <Badge status={selectedStay.status} />
              <span className="text-xs text-slate-500">Ref: {selectedStay.reservationId}</span>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Guest Name</label>
              <p className="text-base font-semibold text-slate-900">{selectedStay.guestName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Check-in</label>
                <p className="text-sm font-semibold">{selectedStay.checkInDate}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Check-out</label>
                <p className="text-sm font-semibold">{selectedStay.checkOutDate}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Phone</label>
              <p className="text-sm text-slate-800">{selectedStay.phone}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Financial Summary</label>
              <div className="p-3 bg-slate-50 rounded-lg flex justify-between mt-1 text-sm">
                <span>Total: {formatCurrency(selectedStay.totalAmount)}</span>
                <span className="font-semibold text-emerald-600">Paid: {formatCurrency(selectedStay.paidAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* New Booking Modal */}
      <Modal
        isOpen={createModal.isOpen}
        onClose={() => setCreateModal({ isOpen: false, unitId: null, date: null })}
        title="Create Reservation / Walk-In"
      >
        <form onSubmit={(e) => { e.preventDefault(); setCreateModal({ isOpen: false, unitId: null, date: null }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Guest Full Name</label>
            <input required type="text" placeholder="e.g. Ramesh Kumar" className="w-full p-2 border border-slate-300 rounded text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Check-in Date</label>
              <input defaultValue={createModal.date} type="date" className="w-full p-2 border border-slate-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Check-out Date</label>
              <input type="date" className="w-full p-2 border border-slate-300 rounded text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
            <input required type="tel" placeholder="+91 90000 00000" className="w-full p-2 border border-slate-300 rounded text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setCreateModal({ isOpen: false, unitId: null, date: null })} className="px-4 py-2 border rounded text-sm font-medium">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Confirm Booking</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}