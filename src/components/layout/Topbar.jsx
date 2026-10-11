import GlobalSearch from './GlobalSearch';
import { Bell, Menu } from 'lucide-react';
import { property } from '../../config/property';

import { useStaff } from '../auth/StaffGate';

export function Topbar({ expanded, onToggle }) {
  const staff = useStaff();
  return (
    <header className="stayman-topbar flex min-h-16 flex-wrap items-center justify-between gap-3 py-2 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="topbar-brand flex min-w-0 items-center gap-3">
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded} aria-controls="main-sidebar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500">
          <Menu size={21} />
        </button>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{staff?.property?.name || property.name}</p>
          <p className="text-xs text-slate-500">{property.appName} · Property management</p></div>
      </div>
      <GlobalSearch />
      <div className="topbar-account flex shrink-0 items-center gap-2 sm:gap-4 max-sm:ml-auto">
        {staff?.properties.length > 1 && <select aria-label="Property" value={staff.property.id} onChange={e => staff.setPropertyId(e.target.value)} className="max-w-32 rounded-lg border p-2">{staff.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {staff && <button onClick={staff.signOut} className="rounded-lg border p-2 text-xs">Sign out</button>}
        <button type="button" aria-label="Notifications" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Bell size={20} /></button>
        <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">PM</div>
          <div className="hidden text-xs sm:block"><p className="font-semibold text-slate-800">Property manager</p><p className="text-slate-500">{staff?.property?.name || property.name}</p></div>
        </div>
      </div>
    </header>
  );
}
