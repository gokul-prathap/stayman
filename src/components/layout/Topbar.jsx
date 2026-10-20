import {ThemeToggle} from '../../theme/ThemeProvider';
import GlobalSearch from './GlobalSearch';
import WebCheckinNotifications from './WebCheckinNotifications';
import { Menu, IndianRupee, LogOut } from 'lucide-react';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import QuickExpenseModal from '../../features/management/components/QuickExpenseModal';
import { property } from '../../config/property';

import './topbar.css';
import { useStaff } from '../auth/StaffGate';

export function Topbar({ expanded, onToggle }) {
  const staff = useStaff();
  const [quickExpense,setQuickExpense]=useState(false),[expenseMessage,setExpenseMessage]=useState('');
  return (
    <header className="stayman-topbar flex min-h-16 flex-wrap items-center justify-between gap-3 py-2 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="topbar-brand flex min-w-0 items-center gap-3">
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded} aria-controls="main-sidebar"
          className="topbar-control topbar-menu">
          <Menu size={21} />
        </button>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{staff?.property?.name || property.name}</p>
          <p className="text-xs text-slate-500">{property.appName} · Property management</p></div>
      </div>
      <GlobalSearch />
      <div className="topbar-account flex shrink-0 items-center gap-2 sm:gap-4 max-sm:ml-auto">
        <ThemeToggle/>
        <button type="button" aria-label="Quick add expense" title="Quick add expense" className="topbar-control topbar-expense" onClick={()=>{setExpenseMessage('');setQuickExpense(true);}}><IndianRupee size={18}/><span className="sr-only">Expense</span></button>
        {staff?.properties.length > 1 && <select aria-label="Property" value={staff.property.id} onChange={e => staff.setPropertyId(e.target.value)} className="topbar-property-switch">{staff.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {staff && <button onClick={staff.signOut} className="topbar-control topbar-signout"><LogOut size={18}/><span>Sign out</span></button>}
        {staff&&<WebCheckinNotifications key={staff.property.id}/>}
        <div className="topbar-profile">
          <Link to="/property-profile" aria-label="View property profile" title="Property profile" className="topbar-avatar">PM</Link>
          <div className="hidden text-xs sm:block"><p className="font-semibold text-slate-800">Property manager</p><p className="text-slate-500">{staff?.property?.name || property.name}</p></div>
        </div>
      </div>
      {expenseMessage&&<div role="status" className="fixed bottom-20 right-4 z-50 rounded-xl border bg-white p-3 text-sm text-blue-700 shadow-lg"><span>{expenseMessage}</span><button aria-label="Dismiss expense confirmation" className="ml-3" onClick={()=>setExpenseMessage('')}>×</button></div>}
      {quickExpense&&<QuickExpenseModal onClose={()=>setQuickExpense(false)} onSaved={()=>setExpenseMessage('Expense saved.')}/>}
    </header>
  );
}
