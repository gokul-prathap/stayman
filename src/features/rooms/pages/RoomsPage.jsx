import {useStaff} from '../../../components/auth/StaffGate';
import RoomInventory from '../components/RoomInventory';
import '../../management/management.css';
export default function RoomsPage(){const {property}=useStaff();return <section className="management space-y-5"><RoomInventory key={property.id} property={property}/></section>;}
