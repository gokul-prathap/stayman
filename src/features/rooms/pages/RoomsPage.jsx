import React from 'react';
import { MOCK_UNITS } from '../../allocation/data/mockAllocationData';

export default function RoomsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Rooms & Bookable Inventory</h1>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 border-b text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="p-3">Room / Unit</th>
              <th className="p-3">Category</th>
              <th className="p-3">Type</th>
              <th className="p-3">Operational State</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-800">
            {MOCK_UNITS.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="p-3 font-semibold">{u.label} <span className="text-slate-400 font-normal">({u.roomName})</span></td>
                <td className="p-3">{u.category}</td>
                <td className="p-3">{u.type}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}