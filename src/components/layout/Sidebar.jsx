import React from 'react';
import { property } from '../../config/property';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
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

export function Sidebar({ expanded, mobile, onToggle, onNavigate }) {
  return (
    <aside id="main-sidebar" aria-label="Main navigation" inert={mobile && !expanded ? true : undefined}
      className={'flex shrink-0 flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200 motion-reduce:transition-none ' +
        (mobile ? 'fixed inset-y-0 left-0 z-50 w-64 ' + (expanded ? 'translate-x-0' : '-translate-x-full') : expanded ? 'relative w-64' : 'relative w-20')}>
      <div className="flex h-20 items-center justify-between gap-2 border-b border-slate-800 px-3">
        {(expanded || mobile) ? <div className="flex min-w-0 items-center gap-2">
          <img src={property.logo} alt={property.name} className="h-11 w-11 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0"><p className="text-base font-bold text-white">{property.appName}</p><p className="truncate text-xs text-slate-300">{property.name}</p></div>
        </div> : null}
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
          {mobile ? <X size={20} /> : expanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === "/"}
            onClick={onNavigate}
            title={!expanded ? item.name : undefined}
            aria-label={item.name}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(expanded || mobile) && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
        {(expanded || mobile) && <p className="font-medium text-slate-300">{property.name}</p>}
        {(expanded || mobile) && <p className="truncate text-slate-500">{property.description}</p>}
      </div>
    </aside>
  );
}