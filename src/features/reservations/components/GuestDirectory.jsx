import {bookingStatus} from '../utils/bookingStatus';
import InvoiceAction from '../../billing/InvoiceAction';
import {genderLabel} from '../../../services/guestGender';
import {SlidersHorizontal,ChevronDown} from 'lucide-react';
import AppLoader from '../../../components/ui/AppLoader';
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
import './guest-register.css';
import {registerDate,registerRooms,registerDocuments,registerStay} from '../utils/guestRegister';
import {money} from '../../management/utils/metrics';
export default function GuestDirectory(){
 const {property}=useStaff(),[params,setParams]=useSearchParams();
 const [filter,setFilter]=useState(params.get('filter')||'all'),[checkin,setCheckin]=useState('all'),[search,setSearch]=useState(''),[term,setTerm]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[expanded,setExpanded]=useState(''),[booking,setBooking]=useState(null);
 const [dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[dateField,setDateField]=useState('arrival');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const activeFilters=Number(filter!=='all')+Number(checkin!=='all')+Number(!!dateFrom)+Number(!!dateTo);
 const invalidDates=!!(dateFrom&&dateTo&&dateFrom>dateTo);
 const [showQR,setShowQR]=useState(false);
 const view=params.get('view'),selected=view?{kind:view.split(':')[0],id:view.split(':')[1]}:null;
 useEffect(()=>{const t=setTimeout(()=>{setTerm(search.trim());setPage(1);},300);return()=>clearTimeout(t);},[search]);
 const query=useQuery({queryKey:['guest-directory',property.id,term,filter,checkin,page,size,dateFrom,dateTo,dateField],enabled:!invalidDates,queryFn:()=>guestDirectory(property.id,term,filter,checkin,page,size,dateFrom,dateTo,dateField)});
 useEffect(()=>{if(params.get('filter')==='all')setFilter('all');},[params.get('filter')]);
 const total=query.data?.total||0,pages=Math.max(1,Math.ceil(total/size));
 useEffect(()=>{if(query.data&&page>pages)setPage(pages);},[pages,page,query.data]);
 const close=()=>setParams(p=>{p.delete('view');return p;});
 const show=row=>setParams(p=>{p.set('view',row.kind+':'+row.id);return p;});
 return <section className="management guest-register space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1>Guests</h1><p className="subtitle">Current guests, upcoming stays and submitted walk-ins.</p></div><div className="flex flex-wrap gap-2"><button className="secondary" onClick={()=>setShowQR(v=>!v)}>Reception QR</button><button className="secondary" onClick={()=>query.refetch()}>Refresh</button><button className="primary" onClick={()=>setBooking({})}>New reservation</button></div></header>
 {showQR&&<div className="card"><CheckinShare publicLink link={window.location.origin+'/guest-check-in?property='+property.id} propertyName={property.name}/></div>}
 <div className="card register-filters"><div className="register-search-toolbar"><label>Search guests<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, phone, email, booking"/></label><button type="button" className="secondary register-filter-toggle" aria-expanded={filtersOpen} aria-controls="guest-extra-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true"/><span>Filters{activeFilters>0?' ('+activeFilters+')':''}</span><ChevronDown size={14} aria-hidden="true"/></button></div><div id="guest-extra-filters" className="register-extra-filters" data-expanded={filtersOpen}><label>Stay status<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{['current','future','past','walkin','all'].map(v=><option key={v} value={v}>{v==='walkin'?'Awaiting allocation':v.charAt(0).toUpperCase()+v.slice(1)}</option>)}</select></label><label>Web check-in<select value={checkin} onChange={e=>{setCheckin(e.target.value);setPage(1);}}><option value="all">All</option><option value="done">Done</option><option value="pending">Not done</option></select></label><label>Rows per page<select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(v=><option key={v}>{v}</option>)}</select></label><label>Date to filter<select value={dateField} onChange={e=>{setDateField(e.target.value);setPage(1);}}><option value="arrival">Arrival</option><option value="departure">Departure</option></select></label><label>From date<input type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>{setDateFrom(e.target.value);setPage(1);}}/></label><label>To date<input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>{setDateTo(e.target.value);setPage(1);}}/></label><div className="flex items-end"><button type="button" className="secondary" disabled={!dateFrom&&!dateTo} onClick={()=>{setDateFrom('');setDateTo('');setPage(1);}}>Clear dates</button></div></div></div>
 {invalidDates&&<p role="alert" className="error">From date must be on or before To date.</p>}
 {!invalidDates&&query.isPending&&<AppLoader label="Loading guests..."/>}{query.error&&<p role="alert" className="error">{databaseError(query.error)}</p>}
 <div className="register-card"><div className="register-table-heading"><strong>Guest register</strong><span>{query.data?.rows.length||0} shown · {total} matching guests</span></div><div className="register-table-scroll" tabIndex={0} role="region" aria-label="Guest register, scroll for all columns"><table className="register-table"><colgroup>{[190,140,190,145,150,105,105,145,115,115,52].map((width,index)=><col key={index} style={{width}}/>)}</colgroup><thead><tr>{['Guest','Gender','Contact','Booking','Room / bed','Arrival','Departure','Travel route','Documents','Stay status','Details'].map((label,index)=><th key={label} className={index===0?'register-guest-cell':''}>{label}</th>)}</tr></thead><tbody>{query.data?.rows.map(row=>{
 const key=row.kind+row.id,rooms=registerRooms(row),documents=registerDocuments(row),open=expanded===key,detailId='guest-extra-'+row.kind+'-'+row.id;
 const toggle=()=>setExpanded(current=>current===key?'':key);
 return <Fragment key={key}><tr className="register-summary-row" onClick={toggle}><td className="register-guest-cell"><button type="button" aria-expanded={open} aria-controls={detailId} onClick={event=>{event.stopPropagation();toggle();}}><span className="register-avatar" aria-hidden="true">{row.name?.trim().charAt(0).toUpperCase()||'G'}</span><span className="register-name-text">{row.name}<small>{row.nationality||'Guest'}</small></span></button></td>
 <td><span className="register-cell-primary" title={genderLabel(row.gender)}>{genderLabel(row.gender)}</span></td>
 <td><span className="register-cell-primary" title={row.phone}>{row.phone||'Not recorded'}</span><span className="register-cell-secondary" title={row.email}>{row.email||'No email recorded'}</span></td>
 <td><span className="register-cell-primary" title={row.booking_ref}>{row.booking_ref||'No reservation'}</span><span className="register-cell-secondary">{row.source||''}</span></td>
 <td title={rooms.title}><span className="register-cell-primary">{rooms.label}</span>{rooms.extra>0&&<span className="register-cell-secondary">+{rooms.extra} more assignments</span>}</td>
 <td className="register-date">{registerDate(row.arrival)}</td><td className="register-date">{registerDate(row.departure)}</td>
 <td className="register-route"><span title={row.coming_from}>From {row.coming_from||'Not recorded'}</span><span title={row.going_to}>To {row.going_to||'Not recorded'}</span></td>
 <td><span className={'register-badge '+documents.tone}>{documents.label}</span></td><td><span className={'register-badge '+row.stay}>{registerStay(row)}</span><span className="register-cell-secondary">{bookingStatus({...row,status:row.booking_status})}</span></td>
 <td><button type="button" className="register-details-toggle" aria-label={(open?'Collapse':'Expand')+' guest '+row.name} aria-expanded={open} aria-controls={detailId} onClick={event=>{event.stopPropagation();toggle();}}><ChevronDown size={15} aria-hidden="true"/></button></td></tr>
 {open&&<tr className="register-expanded" id={detailId}><td colSpan={11}><div className="register-expanded-panel"><div className="register-expanded-content">{[
 ['Booking total',row.total_amount==null?'Not recorded':money(row.total_amount)],['Paid',row.paid_amount==null?'Not recorded':money(row.paid_amount)],[row.closure_kind?'Settlement balance':'Booking balance',row.total_amount==null?'Not recorded':row.closure_money_handler==='EXTERNAL'?'Handled externally':money(Number(row.closure_kind?row.closure_fee:row.total_amount)-Number(row.paid_amount||0))],['Assignments',rooms.title||'No room or bed allocation'],['Gender',genderLabel(row.gender)],['Document review','Open View / ID to inspect submitted photos and compare with the original ID.']
 ].map(([label,value])=><div key={label}><strong>{label}</strong><span>{value}</span></div>)}</div><div className="register-row-actions"><button type="button" className="secondary" onClick={()=>show(row)}>View / ID</button>{row.reservation_id&&<><InvoiceAction reservationId={row.reservation_id}>Print invoice</InvoiceAction><InvoiceAction reservationId={row.reservation_id} download>Download invoice</InvoiceAction></>}{row.kind==='walkin'&&<button type="button" className="primary" onClick={()=>setBooking({walkinId:row.id})}>Allocate bed</button>}</div></div></td></tr>}</Fragment>;
 })}{query.data&&!query.data.rows.length&&<tr><td colSpan={11} className="register-no-results">No guests match these filters. Submitted walk-ins appear under Awaiting allocation.</td></tr>}</tbody></table></div>
 <footer className="register-footer flex flex-wrap items-center justify-between gap-3"><span>{total} guests · Page {page} of {pages}</span><div className="flex gap-2"><button className="secondary" disabled={page<=1||query.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="secondary" disabled={page>=pages||query.isFetching} onClick={()=>setPage(p=>p+1)}>Next</button></div></footer></div>
 <p className="register-caption">Select a guest row to expand booking totals, assignment details and ID/invoice actions. Scroll sideways for all columns.</p>
 <Modal isOpen={!!selected} onClose={close} title="Guest details">{selected&&<GuestProfile key={view} guestId={selected.kind==='guest'?selected.id:undefined} memberId={selected.kind==='member'?selected.id:undefined} walkinId={selected.kind==='walkin'?selected.id:undefined} onAllocate={id=>{close();setBooking({walkinId:id});}}/>}</Modal>
 {booking&&<NewGuestBooking walkinId={booking.walkinId} onClose={()=>setBooking(null)} onSaved={()=>query.refetch()}/>}</section>;
}
