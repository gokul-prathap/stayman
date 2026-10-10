import GuestProfile from './GuestProfile';
import CheckinShare from './CheckinShare';
import {checkinProgress} from '../../management/utils/guestOperations';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePropertyData } from '../hooks/usePropertyData';
import { useStaff } from '../../../components/auth/StaffGate';
import NewReservationModal from '../../../components/reservations/NewReservationModal';
import Modal from '../../../components/ui/Modal';
import ReservationDetails from './ReservationDetails';
import PageState from '../../management/components/PageState';
import { dayInZone, stayKind, money } from '../../management/utils/metrics';
import '../../management/management.css';
export default function ReservationGuestList({ guestView = false }) {
  const { property } = useStaff();
  const { data, isPending, error, refresh } = usePropertyData();
  const [search,setSearch] = useState(''), [open,setOpen] = useState(false), [selected,setSelected] = useState(null), [filter,setFilter] = useState('all');
  const [profile,setProfile]=useState(null),[defaultCheckinId,setDefaultCheckinId]=useState(''),[showPublicQR,setShowPublicQR]=useState(false);
  const { units=[],guests=[],reservations=[],allocations=[],walkins=[] } = data || {};
  const today=dayInZone(new Date(),property.timezone);
  const matches = guest => [guest?.full_name,guest?.phone,guest?.email].some(value => value?.toLowerCase().includes(search.toLowerCase()));
  const guestBookings = guest => reservations.filter(r => guest.memberReservationId ? r.id===guest.memberReservationId : r.guest_id===guest.id);
  const people=[...guests,...(data?.members||[]).map(m=>({id:m.id,memberReservationId:m.reservation_id,full_name:m.details?.full_name||m.display_name,phone:m.details?.phone||'Web check-in pending',email:m.details?.email,nationality:m.details?.foreign_guest?'International guest':'Booking member'}))];
  const rows = guestView ? people.filter(g => matches(g) && (filter==='all' || stayKind(guestBookings(g),today)===filter))
    : reservations.filter(r => matches(guests.find(g => g.id===r.guest_id)) || r.booking_ref.toLowerCase().includes(search.toLowerCase()));
  return <section className="management space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1>{guestView ? 'Guests' : 'Reservations'}</h1><p className="subtitle">{guestView ? 'Current stays, returning memories and upcoming arrivals.' : 'Manage bookings, bed assignments and payments.'}</p></div><div className="flex gap-2"><Link to={guestView ? '/reservations' : '/guests'} className="secondary">{guestView ? 'Reservations' : 'Guest list'}</Link><button disabled={!units.length} onClick={() => {setDefaultCheckinId('');setOpen(true);}} className="primary">New reservation</button></div></div>
    <div className="flex flex-wrap items-center gap-3"><div className="w-full sm:max-w-sm"><input type="search" aria-label="Search guests or reservations" placeholder="Search guest, phone, email or reservation..." value={search} onChange={e => setSearch(e.target.value)}/></div>{guestView && <div className="flex flex-wrap gap-2">{['all','current','future','past'].map(f => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter===f} className={filter===f ? 'primary capitalize' : 'secondary capitalize'}>{f}</button>)}</div>}</div>
    <PageState pending={isPending} error={error} retry={refresh}/>
    {guestView && data && !error && <article className="card"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Walk-ins awaiting allocation ({walkins.length})</h2><p className="muted mt-2">Submitted from the reception QR. Select a person in New reservation to allocate a bed.</p></div><div className="flex gap-2"><button className="secondary" onClick={()=>setShowPublicQR(!showPublicQR)}>Reception QR</button><button className="secondary" onClick={refresh}>Refresh walk-ins</button></div></div>{showPublicQR&&<div className="mt-4"><CheckinShare publicLink link={window.location.origin+'/guest-check-in?property='+property.id} propertyName={property.name}/></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{walkins.filter(w=>matches(w.details)).map(w=><div key={w.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-4"><h2>{w.details.full_name}</h2><p className="muted mt-1">{w.details.phone} · {w.details.arrival_date} to {w.details.departure_date}</p><div className="mt-3 flex flex-wrap gap-2"><button className="secondary" onClick={()=>setProfile({walkinId:w.id})}>Guest details / ID</button><button className="primary" onClick={()=>{setDefaultCheckinId(w.id);setOpen(true);}}>Allocate bed</button></div></div>)}</div>{!walkins.length&&<p className="muted mt-4">No unallocated web check-ins.</p>}</article>}

    {!isPending && !error && (guestView ? <>
      <div className="flex flex-wrap gap-4 text-xs text-gray-500"><span><span className="mr-2 inline-block h-3 w-3 rounded bg-emerald-500"/>Current stay</span><span><span className="mr-2 inline-block h-3 w-3 rounded bg-blue-500"/>Future arrival</span><span><span className="mr-2 inline-block h-3 w-4 rounded border border-dashed border-gray-500"/>Past / inactive</span></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(guest => {
        const bookings=guestBookings(guest), kind=stayKind(bookings,today);
        return <article key={guest.id} className={'rounded-xl p-5 guest-' + kind}><div className="flex items-start justify-between gap-3"><div><h2>{guest.full_name}</h2><p className="muted mt-1">{guest.nationality}</p></div><span className="stay-label text-xs font-semibold capitalize">{kind}</span></div><p className="mt-4 text-sm">{guest.phone}</p><p className="muted mt-1 break-all">{guest.email || 'No email provided'}</p><button className="secondary mt-3" onClick={()=>setProfile(guest.memberReservationId?{memberId:guest.id}:{guestId:guest.id})}>Guest details / ID / web check-in</button><div className="mt-4 space-y-2">{bookings.map(r => <button key={r.id} onClick={() => setSelected(r.id)} className="w-full rounded-lg border border-white/70 bg-white/70 p-3 text-left text-xs hover:bg-white"><span className="flex justify-between gap-2 font-semibold"><span>{r.check_in_date} → {r.check_out_date}</span><span className="text-blue-600">Details</span></span><span className="mt-1 block text-gray-500">{r.status} · Balance {money(Number(r.total_amount)-Number(r.paid_amount))}</span></button>)}</div></article>;
      })}</div>
    </> : <div className="card overflow-x-auto"><table><thead><tr><th>Guest</th><th>Dates</th><th>Bed assignments</th><th>Status</th><th>Web check-in</th><th>Payment</th><th>Details</th></tr></thead><tbody>{rows.map(r => {
      const guest=guests.find(g => g.id===r.guest_id);
      return <tr key={r.id}><td><p className="font-semibold">{guest?.full_name}</p><p className="muted mt-1">{guest?.phone}</p></td><td className="whitespace-nowrap">{r.check_in_date}<br/>{r.check_out_date}</td><td>{allocations.filter(a => a.reservationDbId===r.id).map(a => { const u=units.find(u => u.id===a.unitId); return <p key={a.id} className="mb-1 whitespace-nowrap">{u?.roomName} / {u?.label}<span className="muted block">{a.checkInDate} → {a.checkOutDate}</span></p>; })}</td><td>{r.status}</td><td>{(()=>{const p=checkinProgress(data.members,r.id);return p.total?p.done+'/'+p.total+' submitted':'Not linked';})()}</td><td className="whitespace-nowrap"><p className="font-semibold">{money(r.total_amount)}</p><p className="muted mt-1">{Number(r.paid_amount)===Number(r.total_amount) ? 'Paid in full' : money(Math.abs(Number(r.total_amount)-Number(r.paid_amount))) + (Number(r.paid_amount)>Number(r.total_amount) ? ' refund due' : ' due')}</p></td><td><button className="secondary" onClick={() => setSelected(r.id)}>View / pay</button></td></tr>;
    })}</tbody></table></div>)}
    {!isPending && !error && !rows.length && <p className="notice">No matching records. Create a reservation to add a guest.</p>}
    <NewReservationModal isOpen={open} onClose={() => setOpen(false)} units={units} allocations={allocations} defaultCheckinId={defaultCheckinId} onSaved={refresh}/>
    <Modal isOpen={!!profile} onClose={()=>setProfile(null)} title="Guest details">{profile&&<GuestProfile key={JSON.stringify(profile)} {...profile} onAllocate={id=>{setProfile(null);setDefaultCheckinId(id);setOpen(true);}}/>}</Modal>
    <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Reservation Details">{selected && <ReservationDetails key={property.id + selected} reservationId={selected}/>}</Modal>
  </section>;
}
