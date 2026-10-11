import CheckinShare from './CheckinShare';
import {useEffect,useState,Fragment} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {useStaff} from '../../../components/auth/StaffGate';
import {guestDirectory,databaseError} from '../../../services/stayman';
import Modal from '../../../components/ui/Modal';
import GuestProfile from './GuestProfile';
import NewGuestBooking from './NewGuestBooking';
import '../../management/management.css';
export default function GuestDirectory(){
 const {property}=useStaff(),[params,setParams]=useSearchParams();
 const [filter,setFilter]=useState(params.get('filter')||'current'),[checkin,setCheckin]=useState('all'),[search,setSearch]=useState(''),[term,setTerm]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10),[expanded,setExpanded]=useState(''),[booking,setBooking]=useState(null);
 const [showQR,setShowQR]=useState(false);
 const view=params.get('view'),selected=view?{kind:view.split(':')[0],id:view.split(':')[1]}:null;
 useEffect(()=>{const t=setTimeout(()=>{setTerm(search.trim());setPage(1);},300);return()=>clearTimeout(t);},[search]);
 const query=useQuery({queryKey:['guest-directory',property.id,term,filter,checkin,page,size],queryFn:()=>guestDirectory(property.id,term,filter,checkin,page,size)});
 useEffect(()=>{if(params.get('filter')==='all')setFilter('all');},[params.get('filter')]);
 const total=query.data?.total||0,pages=Math.max(1,Math.ceil(total/size));
 useEffect(()=>{if(query.data&&page>pages)setPage(pages);},[pages,page,query.data]);
 const close=()=>setParams(p=>{p.delete('view');return p;});
 const show=row=>setParams(p=>{p.set('view',row.kind+':'+row.id);return p;});
 return <section className="management space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1>Guests</h1><p className="subtitle">Current guests, upcoming stays and submitted walk-ins.</p></div><div className="flex flex-wrap gap-2"><button className="secondary" onClick={()=>setShowQR(v=>!v)}>Reception QR</button><button className="secondary" onClick={()=>query.refetch()}>Refresh</button><button className="primary" onClick={()=>setBooking({})}>New reservation</button></div></header>
 {showQR&&<div className="card"><CheckinShare publicLink link={window.location.origin+'/guest-check-in?property='+property.id} propertyName={property.name}/></div>}
 <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label>Search guests<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, phone, email, booking"/></label><label>Stay status<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{['current','future','past','walkin','all'].map(v=><option key={v} value={v}>{v==='walkin'?'Awaiting allocation':v.charAt(0).toUpperCase()+v.slice(1)}</option>)}</select></label><label>Web check-in<select value={checkin} onChange={e=>{setCheckin(e.target.value);setPage(1);}}><option value="all">All</option><option value="done">Done</option><option value="pending">Not done</option></select></label><label>Rows per page<select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(v=><option key={v}>{v}</option>)}</select></label></div>
 {query.isPending&&<p role="status">Loading guests...</p>}{query.error&&<p role="alert" className="error">{databaseError(query.error)}</p>}
 <div className="card overflow-x-auto"><table><thead><tr><th>Guest</th><th>Stay</th><th>Web check-in</th><th>Actions</th></tr></thead><tbody>{query.data?.rows.map(row=>{const key=row.kind+row.id;return <Fragment key={key}><tr onClick={()=>setExpanded(expanded===key?'':key)} className={row.stay==='current'?'bg-emerald-50 text-emerald-900':row.stay==='past'?'border-y border-dashed border-slate-400 text-slate-500':'bg-blue-50 text-blue-900'}><td><button className="text-left font-semibold" aria-expanded={expanded===key} onClick={e=>{e.stopPropagation();setExpanded(expanded===key?'':key);}}>{expanded===key?'−':'+'} {row.name}</button></td><td>{row.stay==='walkin'?'Awaiting allocation':row.stay}</td><td>{row.web_done?'Done':'Not done'}</td><td><button className="secondary" onClick={e=>{e.stopPropagation();show(row);}}>View</button></td></tr>{expanded===key&&<tr><td colSpan={4}><div className="flex flex-wrap items-center gap-4 p-2 text-sm"><span>{row.booking_ref||'No reservation yet'}</span><span>{row.arrival||'—'} → {row.departure||'—'}</span><span className="muted">Click View for contact details and documents.</span>{row.kind==='walkin'&&<button className="primary" onClick={()=>setBooking({walkinId:row.id})}>Allocate bed</button>}</div></td></tr>}</Fragment>;})}{query.data&&!query.data.rows.length&&<tr><td colSpan={4}>No guests match these filters. Submitted walk-ins appear under Awaiting allocation.</td></tr>}</tbody></table>
 <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total} guests · Page {page} of {pages}</span><div className="flex gap-2"><button className="secondary" disabled={page<=1||query.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="secondary" disabled={page>=pages||query.isFetching} onClick={()=>setPage(p=>p+1)}>Next</button></div></footer></div>
 <p className="muted">Green: current · Blue: future / unallocated · Dashed: past. Filters, search and pagination run in Supabase.</p>
 <Modal isOpen={!!selected} onClose={close} title="Guest details">{selected&&<GuestProfile key={view} guestId={selected.kind==='guest'?selected.id:undefined} memberId={selected.kind==='member'?selected.id:undefined} walkinId={selected.kind==='walkin'?selected.id:undefined} onAllocate={id=>{close();setBooking({walkinId:id});}}/>}</Modal>
 {booking&&<NewGuestBooking walkinId={booking.walkinId} onClose={()=>setBooking(null)} onSaved={()=>query.refetch()}/>}</section>;
}
