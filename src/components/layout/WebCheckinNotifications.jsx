import AppLoader from '../ui/AppLoader';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Bell,X,RefreshCw,UserRound,CalendarCheck,CheckCheck} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useStaff} from '../auth/StaffGate';
import {useCheckinNotifications} from '../../features/reservations/hooks/useCheckinNotifications';
import Modal from '../ui/Modal';
import './web-checkin-notifications.css';
const ReservationDetails=lazy(()=>import('../../features/reservations/components/ReservationDetails'));
const NewGuestBooking=lazy(()=>import('../../features/reservations/components/NewGuestBooking'));

export default function WebCheckinNotifications(){
 const {property}=useStaff(),{data,error,isPending,isFetching,refresh,refreshNotifications}=useCheckinNotifications({watchChanges:true});
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(null),[walkinId,setWalkinId]=useState(null),[position,setPosition]=useState({});
 const root=useRef(null),bell=useRef(null),closeButton=useRef(null),location=useLocation();
 const tasks=data||{walkins:[],due:[],upcoming:[],count:0};
 const close=()=>{setOpen(false);bell.current?.focus();};
 useEffect(()=>{setOpen(false);setSelected(null);setWalkinId(null);},[location.pathname]);
 useEffect(()=>{
  if(!open)return;
  const positionPanel=()=>{const rect=bell.current.getBoundingClientRect(),width=Math.min(420,window.innerWidth-24);setPosition({top:rect.bottom+10,right:Math.max(12,Math.min(window.innerWidth-rect.right,window.innerWidth-width-12)),width,maxHeight:Math.max(160,window.innerHeight-rect.bottom-24)});};
  const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);bell.current?.focus();}};
  positionPanel();closeButton.current?.focus();
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',positionPanel);window.addEventListener('scroll',positionPanel,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',positionPanel);window.removeEventListener('scroll',positionPanel,true);};
 },[open]);
 const review=id=>{setOpen(false);setSelected(id);};
 function bookingRow(booking,future=false){
  const guest={full_name:booking.guest_name};
  const needsReview=booking.needs_review;
  return <li key={booking.id}><div className="notification-avatar"><CalendarCheck size={17}/></div><div className="notification-person"><strong>{guest?.full_name||'Guest'}</strong><small>{future?'Arriving '+booking.check_in_date:needsReview?'ID needs reception review':'Web check-in submitted · awaiting arrival check-in'}</small><small>{booking.booking_ref}</small></div><button className="notification-action" onClick={()=>review(booking.id)}>{needsReview?'Review ID':'Review'}</button></li>;
 }
 return <><div ref={root} className="notification-anchor"><button ref={bell} type="button" aria-label={error?'Web check-in notifications, refresh required':tasks.count?`Notifications: ${tasks.count} web check-ins need action`:'Notifications: no pending web check-ins'} aria-expanded={open} aria-controls={'checkin-notifications-'+property.id} aria-haspopup="dialog" className="notification-bell" onClick={()=>{setOpen(value=>!value);}}><Bell size={20}/>{tasks.count>0&&<span className="notification-count" aria-hidden="true">{tasks.count>99?'99+':tasks.count}</span>}{error&&<span className="notification-error-dot" aria-hidden="true"/>}</button>
 {open&&<section style={position} id={'checkin-notifications-'+property.id} role="dialog" aria-label="Web check-in notifications" className="checkin-notifications"><header><div><h2>Web check-ins</h2><p>{property.name} · {tasks.count} need action</p></div><button type="button" aria-label="Refresh web check-ins" disabled={isFetching} onClick={refreshNotifications}><RefreshCw size={16} className={isFetching?'notification-refreshing':''}/></button><button ref={closeButton} type="button" aria-label="Close notifications" onClick={close}><X size={18}/></button></header>
 <div className="notification-content">{isPending&&<AppLoader label="Loading web check-ins…"/>}{error&&<div role="alert" className="notification-error">Could not update web check-ins. {data?'Showing the last loaded list.':'Please refresh to try again.'}</div>}
 {!isPending&&!error&&tasks.count===0&&<div className="notification-empty"><CheckCheck size={26}/><strong>All caught up</strong><p>No web check-ins need action now.</p></div>}
 {tasks.count>0&&<><h3>Needs action</h3><ul>{tasks.walkins.map(walkin=><li key={'walkin-'+walkin.id}><div className="notification-avatar"><UserRound size={17}/></div><div className="notification-person"><strong>{walkin.details?.full_name||'Walk-in guest'}</strong><small>{Object.values(walkin.details?.document_screening||{}).includes('manual-review')?'Needs a bed and ID review':'Submitted web check-in · needs a room / bed'}</small></div><button className="notification-action" onClick={()=>{setOpen(false);setWalkinId(walkin.id);}}>Allocate</button></li>)}{tasks.due.map(booking=>bookingRow(booking))}</ul></>}
 {tasks.upcoming.length>0&&<details><summary>Upcoming arrivals ({tasks.upcoming.length})</summary><ul>{tasks.upcoming.map(booking=>bookingRow(booking,true))}</ul></details>}</div>
 <footer><span>Updates every minute ? Lists show up to 100 per group</span><Link to="/" onClick={()=>setOpen(false)}>Open dashboard</Link></footer></section>}</div>
 <Modal isOpen={!!selected} title="Review reservation / web check-in" onClose={()=>{setSelected(null);bell.current?.focus();}}>{selected&&<Suspense fallback={<AppLoader label="Loading reservation…"/>}><ReservationDetails key={selected} reservationId={selected}/></Suspense>}</Modal>
 {walkinId&&<Suspense fallback={<Modal isOpen title="Allocate room / bed" onClose={()=>setWalkinId(null)}><AppLoader label="Loading available rooms…"/></Modal>}><NewGuestBooking walkinId={walkinId} onClose={()=>{setWalkinId(null);bell.current?.focus();}} onSaved={async()=>{setWalkinId(null);await refresh();bell.current?.focus();}}/></Suspense>}
 </>;
}
