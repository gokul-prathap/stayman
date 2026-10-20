import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import Modal from '../../../components/ui/Modal';
import {useStaff} from '../../../components/auth/StaffGate';
import {operationsMutation,operationsError} from '../hooks/useOperations';
import {dayInZone,rupeesToPaise} from '../utils/metrics';
import {expenseCategories} from '../utils/operations';
export default function QuickExpenseModal({onClose,onSaved}){
 const {property}=useStaff(),client=useQueryClient(),today=dayInZone(new Date(),property.timezone);
 const [form,setForm]=useState({description:'',amount:'',category:'OTHER',method:'CASH',vendor:'',paid:true,day:today}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(null),change=(key,value)=>{request.current=null;setForm(previous=>({...previous,[key]:value}));};
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const amount=rupeesToPaise(form.amount);if(amount<=0)throw new Error('Enter a positive expense amount.');request.current||=crypto.randomUUID();await operationsMutation('stayman_add_expense',{p_property:property.id,p_request:request.current,p_details:{category:form.category,description:form.description,vendor:form.vendor,amount_paise:amount,expense_date:form.day,paid_date:form.paid?form.day:'',method:form.paid?form.method:'',due_date:'',units_consumed:''}});await client.invalidateQueries({queryKey:['operations',property.id]});onSaved?.();onClose();}
  catch(err){setError(operationsError(err));}finally{setBusy(false);}
 }
 return <Modal isOpen onClose={()=>{if(!busy)onClose();}} title="Quick expense"><form onSubmit={save} className="management"><fieldset disabled={busy} className="space-y-4"><p className="muted">Record a property cost without leaving your current page.</p><label>What was it for?<input autoFocus required minLength={2} maxLength={250} placeholder="Bought soap, towel laundry, lock repair…" value={form.description} onChange={event=>change('description',event.target.value)}/></label><div className="grid grid-cols-2 gap-3"><label>Amount (INR)<input required type="number" min=".01" max="100000000" step=".01" value={form.amount} onChange={event=>change('amount',event.target.value)}/></label><label>Category<select value={form.category} onChange={event=>change('category',event.target.value)}>{expenseCategories.map(category=><option key={category}>{category}</option>)}</select></label></div><label>Date<input required type="date" max={today} value={form.day} onChange={event=>change('day',event.target.value)}/></label><label className="flex items-center gap-2"><input type="checkbox" checked={form.paid} onChange={event=>change('paid',event.target.checked)}/>Already paid</label>{form.paid&&<label>Payment method<select value={form.method} onChange={event=>change('method',event.target.value)}>{['CASH','UPI','CARD','BANK'].map(method=><option key={method}>{method}</option>)}</select></label>}<details><summary className="text-sm cursor-pointer">Vendor / paid to (optional)</summary><input aria-label="Vendor or paid to" maxLength={100} value={form.vendor} onChange={event=>change('vendor',event.target.value)}/></details>{error&&<p role="alert" className="error">{error}</p>}<div className="flex gap-2"><button className="primary">{busy?'Saving...':'Save expense'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div><Link className="text-sm text-blue-600 inline-block" to="/expenses?add=1" onClick={onClose}>Open full expense form</Link><p className="muted">Records a cost/payment already made. Does not transfer money or automatically bill a guest.</p></fieldset></form></Modal>;
}
