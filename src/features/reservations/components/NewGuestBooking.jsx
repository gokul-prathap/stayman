import NewReservationModal from '../../../components/reservations/NewReservationModal';
export default function NewGuestBooking({walkinId,onClose,onSaved}){
 return <NewReservationModal isOpen defaultCheckinId={walkinId} onClose={onClose} onSaved={onSaved}/>;
}
