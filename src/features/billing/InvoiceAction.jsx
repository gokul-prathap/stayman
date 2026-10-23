import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {adminRpc} from '../../services/platformAdmin';
import {databaseError} from '../../services/databaseErrors';
import Modal from '../../components/ui/Modal';
import AppLoader from '../../components/ui/AppLoader';
import InvoiceCheckout from './InvoiceCheckout';

export default function InvoiceAction({reservationId,children='Print invoice',download=false,className='secondary'}){
 const [open,setOpen]=useState(false),client=useQueryClient();
 const query=useQuery({queryKey:['invoice-context',reservationId],enabled:open,queryFn:()=>adminRpc('stayman_invoice_context',{p_reservation:reservationId}),retry:false,staleTime:0});
 const f=query.data,ready=f?.checkout_status==='CHECKED_OUT'&&f?.status==='ISSUED'&&Number(f?.balance)===0;
 async function updated(){
  await client.invalidateQueries({queryKey:['folio',reservationId]});
  await client.invalidateQueries({queryKey:['stayman']});
  await client.invalidateQueries({queryKey:['guest-directory']});
  await query.refetch();
 }
 return <><button type="button" className={className} onClick={()=>setOpen(true)}>{children}</button>{open&&(
  query.isPending||query.error?<Modal isOpen onClose={()=>setOpen(false)} title="Invoice">{query.error?<div className="management space-y-3"><p role="alert">{databaseError(query.error)}</p><button className="secondary" onClick={()=>query.refetch()}>Retry invoice</button></div>:<AppLoader label="Loading invoice…"/>}</Modal>:
  ready?<Modal isOpen onClose={()=>setOpen(false)} title={download?'Download invoice':'Print invoice'}><iframe title="Invoice print preview" src={'/invoice/'+reservationId+(download?'?download=1':'?print=1')} style={{width:'100%',height:'65vh',border:0}}/></Modal>:
  <InvoiceCheckout reservationId={reservationId} folio={f} onUpdated={updated} onClose={()=>setOpen(false)}/>
 )}</>;
}
