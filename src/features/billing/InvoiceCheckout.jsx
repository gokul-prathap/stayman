import '../management/management.css';
import './billing.css';
import './invoice-checkout.css';
import {Link} from 'react-router-dom';
import {useState} from 'react';
import {adminRpc} from '../../services/platformAdmin';
import {money} from '../management/utils/metrics';
import Modal from '../../components/ui/Modal';

export default function InvoiceCheckout({reservationId,folio,onUpdated,onClose}){
 const [open,setOpen]=useState(true),[selected,setSelected]=useState([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [bill,setBill]=useState({name:folio.bill_to?.name||folio.guest.name,address:folio.bill_to?.address??folio.guest_address??'',gstin:folio.bill_to?.gstin||''});
 const checkedOut=folio.checkout_status==='CHECKED_OUT',members=folio.members||[],remaining=members.filter(m=>!m.checked_out_at);
 const configured=folio.settings.registration!=='UNCONFIGURED';
 const allSelected=remaining.every(m=>selected.includes(m.id));
 async function proceed(){
  setBusy(true);setError('');
  try{
   if(!checkedOut){
    await adminRpc('stayman_checkout_guests',{p_reservation:reservationId,p_members:selected,p_all:members.length===0});
    if(!allSelected){await onUpdated();setOpen(false);onClose?.();return;}
   }
   if(!configured){await onUpdated();return;}
   if(Number(folio.balance)!==0){await onUpdated();return;}
   if(folio.status!=='ISSUED'){
    const id=await adminRpc('stayman_prepare_folio',{p_reservation:reservationId,p_bill_to:bill});
    const current=await adminRpc('stayman_folio_preview',{p_reservation:reservationId});
    await adminRpc('stayman_issue_folio',{p_folio:id,p_expected:current});
   }
   await onUpdated();
  }catch(err){setError(err.message);await onUpdated();}finally{setBusy(false);}
 }
 return <>{!onClose&&<main className="management invoice-checkout-page"><section className="card space-y-4"><h1>{folio.property.name} ? Invoice</h1><p className="muted">Booking {folio.booking.reference}</p><p>Final invoices are available after every guest has checked out and the full bill is paid.</p><div className="invoice-checkout-actions"><button className="primary" onClick={()=>setOpen(true)}>Review checkout & invoice</button><Link className="secondary" to="/guests">Back to guests</Link></div>{!configured&&<p className="notice">Printing is blocked until property billing setup is complete. Your booking and payments remain saved.</p>}</section></main>}
 <Modal isOpen={open} onClose={()=>{if(!busy){setOpen(false);onClose?.();}}} title={checkedOut?'Finalise invoice':'This guest has not checked out'}><div className="management invoice-checkout-form space-y-4">
 <div className="billing-totals"><div><small>Total</small><strong>{money(folio.total)}</strong></div><div><small>Paid</small><strong>{money(folio.net_paid)}</strong></div><div><small>Balance</small><strong>{money(folio.balance)}</strong></div></div>
 {!checkedOut&&<><p>Select departing guests. Leave extended guests unchecked, and save their new departure dates in the reservation before final checkout. Charges are retained; checkout does not apply an early-departure refund.</p>{members.length>0&&<><button type="button" className="secondary" disabled={busy} onClick={()=>setSelected(remaining.map(m=>m.id))}>Select all guests</button>{members.map(m=><label key={m.id} className="flex items-center gap-2"><input type="checkbox" disabled={busy||!!m.checked_out_at} checked={!!m.checked_out_at||selected.includes(m.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/>{m.name}{m.checked_out_at?' · Checked out':''}</label>)}</>}
 {members.length>1&&<p className="notice">This booking has one shared invoice. It stays open while any guest remains. Individual rooms cannot be released by guest selection because guests are not linked to rooms; review room allocations separately.</p>}</>}
 {Number(folio.balance)!==0&&<p role="alert" className="notice">{folio.balance>0?'Record the remaining payment in Invoice preparation before printing.':'Resolve the credit / refund balance before printing.'} You can check out now and print after settlement.</p>}
 {folio.status!=='ISSUED'&&<><label>Bill to<input required value={bill.name} onChange={e=>setBill({...bill,name:e.target.value})}/></label><label>Billing address<input value={bill.address} onChange={e=>setBill({...bill,address:e.target.value})}/></label><label>Customer GSTIN (optional)<input maxLength={15} value={bill.gstin} onChange={e=>setBill({...bill,gstin:e.target.value.toUpperCase()})}/></label></>}
 {folio.settings.registration==='UNCONFIGURED'&&<p className="notice">Printing is blocked because this property's billing setup is incomplete. Open Platform admin ? property ? Billing and confirm the legal name, billing address, GST registration status and invoice prefix. This is a one-time setup; invoice approval is not required.</p>}
 {error&&<p role="alert" className="error">{error}</p>}
 <button className="primary" disabled={busy||(!checkedOut&&members.length>0&&!selected.length)||(!checkedOut&&folio.checkout_status!=='CHECKED_IN')||(checkedOut&&(Number(folio.balance)!==0||folio.settings.registration==='UNCONFIGURED'))} onClick={proceed}>{busy?'Saving…':checkedOut?'Issue & print invoice':allSelected&&configured&&Number(folio.balance)===0?'Check out & print invoice':'Check out selected guests'}</button>
 {!checkedOut&&folio.checkout_status!=='CHECKED_IN'&&<p>Only checked-in stays can check out. Open the reservation to check in or review a cancelled booking.</p>}
 </div></Modal></>;
}
