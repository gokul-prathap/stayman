import React from 'react';

export default function HousekeepingPage() {
  const tasks = [
    { unit: 'Room 101', status: 'READY', priority: 'LOW', housekeeper: 'Anil' },
    { unit: 'Bed D (Dorm 201)', status: 'OUT_OF_SERVICE', priority: 'HIGH', housekeeper: 'Maintenance' },
    { unit: 'Bed A (Dorm 201)', status: 'DIRTY', priority: 'MEDIUM', housekeeper: 'Sunita' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Housekeeping & Maintenance</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tasks.map((t, idx) => (
          <div key={idx} className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-900">{t.unit}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-medium">{t.status}</span>
            </div>
            <p className="text-xs text-slate-500">Assigned: {t.housekeeper}</p>
            <p className="text-xs text-rose-600 font-semibold">Priority: {t.priority}</p>
          </div>
        ))}
      </div>
    </div>
  );
}