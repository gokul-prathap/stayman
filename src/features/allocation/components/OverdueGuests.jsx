import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {Link} from 'react-router-dom';
import AppLoader from '../../../components/ui/AppLoader';

export default function OverdueGuests({onReview,notifications}){
 const [open,setOpen]=useState(false);
 const {data,error,isPending,isFetching,refreshNotifications}=notifications;
 const {overdue=[],overdue_count=0,missed=[],missed_walkins=[],missed_count=0,no_show_sync=[],no_show_sync_count=0}=data||{};
 return <article className="card overdue-guest-queue attention-card attention-amber" aria-label="Overdue guests"><div className="attention-heading"><div><h2>Departure review</h2><p><strong className="attention-number">{overdue_count}</strong> overdue <span>&#183; {missed_count} missed arrivals</span></p>{no_show_sync_count>0&&<p className="muted">{no_show_sync_count} no-show channel updates pending / need review</p>}</div><button type="button" className="attention-toggle" aria-label={open?'Collapse departure review':'Expand departure review'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><ChevronDown size={26}/></button></div>
 {open&&<div className="attention-body"><button className="secondary" disabled={isFetching} onClick={refreshNotifications}>Refresh</button>
 {error?<p className="error" role="alert">Could not load overdue guests. Please refresh.</p>:isPending?<AppLoader label="Checking departures…"/>:<>
 {!data?.overdue&&<p className="notice">Apply database update 038 to enable overdue departures.</p>}
 <p className="muted">Booked departure time has passed. Confirm departure or extend the stay.</p>
 <ul className="web-checkin-list" aria-label="Overdue departures" tabIndex={0}>{overdue.map(r=><li className="web-checkin-row" key={r.id}><span className="web-checkin-name"><strong>{r.guest_name}</strong><small>Departure {r.check_out_date} · Overdue checkout</small></span><button className="primary" onClick={()=>onReview(r.id)}>Review / check out</button></li>)}</ul>
 {!overdue.length&&data?.overdue&&<p className="muted">No overdue departures.</p>}
 {overdue_count>overdue.length&&<p className="muted">Showing the oldest 100 of {overdue_count} overdue bookings.</p>}
 {missed_count>0&&<details className="missed-arrivals"><summary>Missed arrivals / past-date submissions ({missed_count})</summary><p className="muted">Web check-in does not confirm arrival. Review dates and confirm whether the guest stayed before changing the booking.</p><ul className="web-checkin-list" aria-label="Missed arrivals" tabIndex={0}>{missed.map(r=><li className="web-checkin-row" key={r.id}><span className="web-checkin-name"><strong>{r.guest_name}</strong><small>Not marked checked in · Departure {r.check_out_date}</small></span><button className="secondary" onClick={()=>onReview(r.id)}>Review booking</button></li>)}{missed_walkins.map(w=><li className="web-checkin-row" key={w.id}><span className="web-checkin-name"><strong>{w.details.full_name}</strong><small>Unallocated · Departure {w.details.departure_date}</small></span><Link className="secondary" to={'/guests?view=walkin:'+w.id}>Review submission</Link></li>)}</ul>{missed_count>missed.length+missed_walkins.length&&<p className="muted">Lists show up to 100 per group.</p>}</details>}
 {no_show_sync_count>0&&<details><summary>No-show channel updates ({no_show_sync_count})</summary><ul className="web-checkin-list">{no_show_sync.map(r=><li className="web-checkin-row" key={r.id}><span className="web-checkin-name"><strong>{r.guest_name}</strong><small>{r.status==='REVIEW'?'Provider verification required':'Sync pending'}</small></span><button className="secondary" onClick={()=>onReview(r.id)}>Review sync</button></li>)}</ul></details>}
 </>}

 </div>}
 </article>;
}
