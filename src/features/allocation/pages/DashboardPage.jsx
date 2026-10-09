import React from 'react';
import { Bed, Users, DollarSign, CalendarCheck } from 'lucide-react';
import { formatCurrency } from '../../../utils/Formatters';

export default function DashboardPage() {
  const stats = [
    { title: 'Occupied Units', value: '2 / 8', icon: Bed, sub: '25% Occupancy' },
    { title: 'Expected Arrivals', value: '1', icon: CalendarCheck, sub: 'Today' },
    { title: 'Active Guests', value: '2', icon: Users, sub: 'In-house' },
    { title: "Today's Revenue", value: formatCurrency(990000), icon: DollarSign, sub: 'Collected' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Operational Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.title} className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">{s.title}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
              <p className="text-xs text-indigo-600 mt-1 font-medium">{s.sub}</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <s.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}