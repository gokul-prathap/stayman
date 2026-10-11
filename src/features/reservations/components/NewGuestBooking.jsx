import {usePropertyData} from '../hooks/usePropertyData';
import NewReservationModal from '../../../components/reservations/NewReservationModal';
import {databaseError} from '../../../services/stayman';
export default function NewGuestBooking({walkinId,onClose,onSaved}){
 const {data,isPending,error,refresh}=usePropertyData();
 if(isPending)return <p role="status">Loading available beds...</p>;
 if(error)return <p role="alert">{databaseError(error)} <button onClick={onClose}>Close</button></p>;
 return <NewReservationModal isOpen units={data.units} allocations={data.allocations} defaultCheckinId={walkinId} onClose={onClose} onSaved={async()=>{await refresh();onSaved();}}/>;
}
