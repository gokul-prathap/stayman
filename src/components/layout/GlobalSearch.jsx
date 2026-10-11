import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {Search} from 'lucide-react';
import {useStaff} from '../auth/StaffGate';
import {guestDirectory,databaseError} from '../../services/stayman';
export default function GlobalSearch(){
 const {property}=useStaff(),navigate=useNavigate();
 const [text,setText]=useState(''),[term,setTerm]=useState(''),[open,setOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false);
 useEffect(()=>{const t=setTimeout(()=>setTerm(text.trim()),300);return()=>clearTimeout(t);},[text]);
 useEffect(()=>{setText('');setTerm('');setOpen(false);},[property.id]);
 const query=useQuery({queryKey:['global-search',property.id,term],queryFn:()=>guestDirectory(property.id,term,'all','all',1,10),enabled:term.length>=2,staleTime:15000});
 const select=row=>{navigate('/guests?view='+row.kind+':'+row.id+'&filter=all');setOpen(false);};
 return <div className={"global-search relative min-w-0 flex-1 max-w-sm max-sm:order-last max-sm:basis-full max-sm:max-w-none "+(mobileOpen?"is-open":"")}><button type="button" className="search-toggle hidden" aria-label={mobileOpen?"Close search":"Open search"} aria-expanded={mobileOpen} onClick={()=>{setMobileOpen(v=>!v);setOpen(false);}}><Search size={18}/></button><div className="global-search-field flex items-center gap-2 rounded-lg border bg-slate-50 p-2"><Search size={16} className="shrink-0 text-slate-400"/><input type="search" aria-label="Search reservations or guests" maxLength={100} value={text} onFocus={()=>setOpen(true)} onChange={e=>{setText(e.target.value);setOpen(true);}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);if(e.key==='Enter'&&query.data?.rows[0])select(query.data.rows[0]);}} placeholder="Guest, phone, booking..." className="w-full min-w-0 bg-transparent text-sm outline-none"/></div>
 {open&&text&&<div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl"><button className="float-right p-1 text-xs" onClick={()=>setOpen(false)}>Close</button>{term.length<2?<p className="p-2 text-xs">Type at least 2 characters.</p>:query.isFetching?<p className="p-2 text-xs">Searching...</p>:query.error?<p role="alert" className="p-2 text-xs text-red-600">{databaseError(query.error)}</p>:query.data?.rows.length?query.data.rows.map(row=><button key={row.kind+row.id} className="block w-full rounded-lg p-3 text-left text-sm hover:bg-brand-50" onClick={()=>select(row)}><strong>{row.name}</strong><span className="block text-xs text-slate-500">{row.booking_ref||'Awaiting allocation'} · {row.stay}</span></button>):<p className="p-2 text-xs">No matching guest or reservation.</p>}</div>}</div>;
}
