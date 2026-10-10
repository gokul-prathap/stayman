import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { money } from '../../management/utils/metrics';
import PageState from '../../management/components/PageState';
import '../../management/management.css';
export default function RoomsPage() {
 const {data,isPending,error,refresh}=usePropertyData();
 return <section className="management space-y-5"><h1>Rooms & Beds</h1><p className="subtitle">Bookable inventory saved for this property.</p><PageState pending={isPending} error={error} retry={refresh}/>{data && !error && <div className="card overflow-x-auto"><table><thead><tr><th>Room</th><th>Bed / unit</th><th>Type</th><th>Gender policy</th><th>Nightly rate</th></tr></thead><tbody>{data.units.map(u=><tr key={u.id}><td>{u.roomName}</td><td>{u.label}</td><td>{u.type==='ROOM'?'Private room':'Dorm bed'}</td><td>{u.genderPolicy}</td><td>{money(u.nightlyRatePaise)}</td></tr>)}{!data.units.length && <tr><td colSpan={5}>No units configured. Add this property's beds to stayman_units in Supabase.</td></tr>}</tbody></table></div>}</section>;
}
