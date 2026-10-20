import NightScene from '../illustrations/NightScene';
import React from 'react';
import { useStaff } from '../auth/StaffGate';
import { property } from '../../config/property';
import PropertyLogo from '../ui/PropertyLogo';
import { PanelLeftClose, PanelLeftOpen, X, LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarRange, 
  BookOpenCheck, 
  BedSingle, 
  Users, 
  Sparkles, 
  BarChart3, 
  Settings,
  Tags, IndianRupee
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Stay View', href: '/stayview', icon: CalendarRange },
  { name: 'Reservations', href: '/reservations', icon: BookOpenCheck },
  { name: 'Rooms & Beds', href: '/rooms', icon: BedSingle },
  { name: 'Guests', href: '/guests', icon: Users },
  { name: 'Housekeeping', href: '/housekeeping', icon: Sparkles },
  { name: 'Expenses', href: '/expenses', icon: IndianRupee },
  { name: 'Pricing', href: '/pricing', icon: Tags },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar({ expanded, mobile, onToggle, onNavigate }) {
  const staff = useStaff();
  return (
    <aside id="main-sidebar" aria-label="Main navigation" inert={mobile && !expanded ? true : undefined}
      className={'isolate flex shrink-0 flex-col overflow-hidden transition-all duration-200 motion-reduce:transition-none ' +
        (mobile ? 'fixed inset-y-0 left-0 z-50 w-64 ' + (expanded ? 'translate-x-0' : '-translate-x-full') : expanded ? 'relative w-64' : 'relative w-20')}>
      {(expanded||mobile)&&<div className="sidebar-night-scene" aria-hidden="true"><NightScene transparentSky/></div>}
      <div className="relative z-10 flex h-20 shrink-0 items-center justify-between gap-2 px-3">
        {(expanded || mobile) ? <div className="flex min-w-0 items-center gap-2">
          <PropertyLogo property={staff?.property} className="h-11 w-11 shrink-0 rounded-lg"/>
          <div className="min-w-0"><p className="text-base font-bold text-white">{staff?.property?.name || 'Property'}</p><p className="truncate text-xs text-slate-300">{staff?.property?.tagline || property.appName}</p></div>
        </div> : null}
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-[#243b58]">
          {mobile ? <X size={20} /> : expanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>
      <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
                  ? 'bg-[#2f5083] text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(expanded || mobile) && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-property-footer relative z-10 shrink-0 p-4 text-xs text-slate-300">
        {(expanded || mobile) && <p className="font-medium text-slate-300">{staff?.property?.name || 'Property'}</p>}
        {(expanded || mobile) && <p className="truncate text-slate-300">{staff?.property?.tagline}</p>}
        {staff&&(expanded||mobile)&&<div className="sidebar-mobile-account md:hidden">{staff.properties.length>1&&<select aria-label="Switch property" value={staff.property.id} onChange={event=>staff.setPropertyId(event.target.value)}>{staff.properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}<button type="button" onClick={staff.signOut}><LogOut size={17}/>Sign out</button></div>}
      </div>
    </aside>
  );
}
