import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarRange, 
  BookOpenCheck, 
  BedSingle, 
  Users, 
  Sparkles, 
  BarChart3, 
  Settings 
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Tape Chart', href: '/allocation', icon: CalendarRange },
  { name: 'Reservations', href: '/reservations', icon: BookOpenCheck },
  { name: 'Rooms & Beds', href: '/rooms', icon: BedSingle },
  { name: 'Guests', href: '/guests', icon: Users },
  { name: 'Housekeeping', href: '/housekeeping', icon: Sparkles },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <span className="text-xl font-black tracking-wider text-white">STAYMAN</span>
        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
          PMS
        </span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {item.name}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
        <p className="font-medium text-slate-300">Fort Kochi Homestay</p>
        <p className="truncate text-slate-500">ID: fkh-001</p>
      </div>
    </aside>
  );
}