import React, { useMemo, useState } from 'react';
import { 
  Bed, DoorOpen, X, Plus, User, ChevronLeft, ChevronRight 
} from 'lucide-react';

const statusStyles = {
  CHECKED_IN: 'bg-emerald-100 text-emerald-900',
  PENDING_CHECKIN: 'bg-amber-50 text-amber-900 border-dashed',
};

export default function BedAllocationMatrix() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Mock data
  const resources = [
    { 
      id: 'room-101', 
      name: 'Rm 101', 
      type: 'PRIVATE', 
      reservations: [{ id: 'r1', status: 'CHECKED_IN', guestName: 'Arjun Menon' }] 
    },
    { 
      id: 'dorm-201', 
      name: 'Dorm 201', 
      type: 'DORM', 
      beds: [
        { id: 'bed-a', name: 'Bed A', reservations: [{ id: 'r2', status: 'CHECKED_IN' }] },
        { id: 'bed-b', name: 'Bed B', reservations: [{ id: 'r3', status: 'PENDING_CHECKIN' }] },
        { id: 'bed-c', name: 'Bed C', reservations: [] },
        { id: 'bed-d', name: 'Bed D', reservations: [], maintenance: true },
      ],
    },
  ];

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      
      {/* Header */}
      <header className="p-4 border-b flex justify-between items-center bg-slate-50">
        <h2 className="font-bold text-lg">Bed Allocation</h2>
        <div className="flex gap-2">
          <button><ChevronLeft size={16}/></button>
          <button><ChevronRight size={16}/></button>
        </div>
      </header>

      {/* Calendar */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 w-64 min-w-[256px]">Room / Bed</th>
              {days.map((day, i) => (
                <th key={i} className="border-r text-center p-3 bg-slate-50/50">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource, rIdx) => (
              resource.type === 'PRIVATE' ? (
                <React.Fragment key={resource.id}>
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r w-64 min-w-[256px] flex items-center gap-2 font-medium">
                      <DoorOpen size={16} className="text-purple-500"/> 
                      {resource.name}
                    </td>
                    {Array(7).fill(null).map((_, cIdx) => (
                      <td key={cIdx} className="border-r text-center p-2 hover:bg-indigo-50 cursor-pointer">
                        {!resource.reservations[cIdx % resource.reservations.length] && <Plus size={14}/>}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              ) : (
                <React.Fragment key={resource.id}>
                  {/* Dorm Group Header */}
                  <tr className="bg-slate-50/70 border-b text-xs">
                    <td className="sticky left-0 z-10 bg-slate-50/80 p-2 px-4 w-64 min-w-[256px] font-medium">
                      <User size={14} className="text-violet-500"/> {resource.name}
                    </td>
                    <td colSpan={7}>Individual beds</td>
                  </tr>
                  
                  {/* Individual Beds */}
                  {resource.beds.map((bed) => (
                    <tr key={bed.id} className="border-b">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r w-64 min-w-[256px] flex items-center gap-2 font-medium">
                        <Bed size={14} className={`text-${bed.id === 'bed-d' ? 'slate-400' : 'violet-500'}`} /> 
                        {bed.name}
                      </td>
                      
                      {/* Bed Days */}
                      {Array(7).fill(null).map((_, cIdx) => (
                        <td key={cIdx} className="border-r text-center p-2" style={{ opacity: bed.maintenance ? 0.4 : 1 }}>
                          {!bed.reservations[cIdx % bed.reservations.length] && 
                           <Plus size={14}/>
                          }
                          
                          {/* Reservation overlay */}
                          {bed.reservations.map((res, resIdx) => (
                            <div 
                              key={res.id}
                              className="absolute left-2 top-1 right-3 h-6 border-l-2 rounded px-1 text-xs"
                              style={{
                                backgroundColor: statusStyles[res.status]?.replace('text-', '') || 'transparent',
                                borderColor: res.status === 'CHECKED_IN' ? '#059669' : '#d97706',
                              }}
                            >
                              {res.guestName}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
