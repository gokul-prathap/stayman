import {useState} from 'react';
import {House} from 'lucide-react';
import {bookingSource} from '../../services/bookingSource';
import './booking-source.css';

export default function BookingSource({source,compact=false}){
 const site=bookingSource(source),[failedIcon,setFailedIcon]=useState(null);
 return <span className={'booking-source'+(compact?' booking-source--compact':'')} role="img" aria-label={'Booking source: '+site.label} title={'Booking source: '+site.label}>
  <span className="booking-source__mark" aria-hidden="true">{site.icon&&failedIcon!==site.icon?<img src={site.icon} alt="" draggable={false} width="20" height="20" onError={()=>setFailedIcon(site.icon)}/>:site.kind==='direct'?<House size={14}/>:<span className="booking-source__fallback">{site.initials}</span>}</span>
  {!compact&&<span className="booking-source__name" aria-hidden="true">{site.label}</span>}
 </span>;
}
