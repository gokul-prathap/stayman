import {useEffect,useRef,useState} from 'react';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
import {expenseRpc,expenseError} from '../hooks/useExpenseData';
import {expenseCategories} from '../utils/operations';
import {categoryLabel,costKinds} from '../utils/expenseReports';
import {dayInZone,money,rupeesToPaise} from '../utils/metrics';
const shortcuts=['LAUNDRY','CLEANING','SUPPLIES','ELECTRICITY','SALARY','REPAIRS','OTHER'];
export function ExpenseDialog({title,children,onClose}){
 const ref=useRef(null);
 useEffect(()=>{const el=ref.current;if(!el.open)el.showModal();return()=>el.close();},[]);
 return <dialog ref={ref} aria-label={title} className="expense-dialog management" onCancel={e=>{e.preventDefault();onClose();}}><div className="flex justify-between gap-4 mb-4"><h2>{title}</h2><button type="button" className="secondary" onClick={onClose} aria-label="Close dialog">Close</button></div>{children}</dialog>;
}
export default function ExpenseForm({editing,isOwner,onClose,onSaved,repeat=false,onBusyChange}){
 const {property}=useStaff(),today=dayInZone(new Date(),property.timezone);
 const [form,setForm]=useState(()=>({category:'',amount:'',expense_date:today,payment_state:'',paid_by:'PROPERTY',method:'UPI',paid_date:today,initial_amount:'',cost_kind:'OPERATING',description:'',vendor:'',staff_name:'',due_date:'',units_consumed:'',billing_from:'',billing_to:'',laundry_quantity:'',laundry_unit:'',repeat_monthly:false,receipt_path:'',...(editing?{...editing,amount:String(Number(editing.amount_paise)/100),expense_date:repeat?today:editing.expense_date,payment_state:repeat?'':(Number(editing.balance?.paid)>0?'paid':'unpaid'),paid_date:today,receipt_path:repeat?'':editing.receipt_path||'',billing_from:repeat?'':editing.billing_from||'',billing_to:repeat?'':editing.billing_to||'',due_date:repeat?'':editing.due_date||'',units_consumed:repeat?'':editing.units_consumed??'',laundry_quantity:repeat?'':editing.laundry_quantity??'',laundry_unit:editing.laundry_unit||''}:{} )}));
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[file,setFile]=useState(null),[duplicate,setDuplicate]=useState(false);
 const request=useRef(crypto.randomUUID()),uploaded=useRef(''),uploads=useRef([]),retained=useRef('');
 useEffect(()=>()=>{const abandoned=uploads.current.filter(path=>path!==retained.current);if(abandoned.length)db().storage.from('expense-receipts').remove(abandoned).catch(()=>{});},[]);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const isEdit=!!editing&&!repeat,locked=isEdit&&Number(editing.balance?.paid)>0;
 const change=(key,value)=>{setForm(v=>({...v,[key]:value}));setError('');};
 const field=(key,label,props={})=><label>{label}<input {...props} value={form[key]??''} onChange={e=>change(key,e.target.value)}/></label>;
 async function save(event,allowDuplicate=false){
  event?.preventDefault();if(busy)return;setError('');setBusy(true);
  try{
   if(!form.category)throw new Error('Choose what this expense was for.');
   if(!isEdit&&!form.payment_state)throw new Error('Choose Paid, Partly paid, or Pay later.');
   const amount=rupeesToPaise(form.amount),initial=isEdit?0:form.payment_state==='paid'?amount:form.payment_state==='partial'?rupeesToPaise(form.initial_amount):0;
   if(amount<=0||initial>amount||form.payment_state==='partial'&&initial<=0)throw new Error('Enter a positive bill amount and a valid payment.');
   if(file&&!uploaded.current){
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type];
    if(!ext||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG, WebP or PDF receipt up to 5 MB.');
    const path=`${property.id}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db().storage.from('expense-receipts').upload(path,file,{contentType:file.type});if(error)throw error;uploaded.current=path;uploads.current.push(path);
   }
   const details={...form,amount_paise:amount,initial_payment:initial,receipt_path:uploaded.current||form.receipt_path||'',allow_duplicate:allowDuplicate,
    repeat_source:repeat?editing.id:form.repeat_source||'',units_consumed:form.category==='ELECTRICITY'?form.units_consumed:'',laundry_quantity:form.category==='LAUNDRY'?form.laundry_quantity:'',laundry_unit:form.category==='LAUNDRY'?form.laundry_unit:''};
   await expenseRpc('stayman_save_expense_v2',{p_property:property.id,p_details:details,p_request:request.current,p_expense:isEdit?editing.id:null,p_expected:isEdit?editing.updated_at:null,p_reason:reason});
   retained.current=uploaded.current;
   if(isEdit&&uploaded.current&&editing.receipt_path&&editing.receipt_path!==uploaded.current)await db().storage.from('expense-receipts').remove([editing.receipt_path]).catch(()=>{});
   await onSaved(`${money(amount)} ${categoryLabel(form.category).toLowerCase()} ${isEdit?'updated':'saved'}.`);
  }catch(e){if(e.message?.startsWith('Possible duplicate'))setDuplicate(true);else setError(expenseError(e));}finally{setBusy(false);}
 }
 return <div className="card"><form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><div className="flex justify-between items-center"><h2>{repeat?'Review next monthly bill':isEdit?'Correct expense':'Add expense'}</h2><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="grid gap-4 sm:grid-cols-2">{field('amount','How much? (₹)',{type:'number',required:true,min:'.01',max:'100000000',step:'.01',disabled:locked,autoFocus:!locked})}{field('expense_date','Bill date',{type:'date',required:true,max:today,disabled:locked})}</div>
  <div><p className="mb-2">What was it for?</p><div className="expense-shortcuts">{shortcuts.map(c=><button type="button" key={c} className="secondary" aria-pressed={form.category===c} onClick={()=>change('category',c)}>{categoryLabel(c)}</button>)}</div><label className="mt-3">Category<select required value={form.category} onChange={e=>change('category',e.target.value)}><option value="">Choose a category</option>{expenseCategories.map(c=><option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label></div>
  {!isEdit&&<><div><p className="mb-2">Paid already?</p><div className="expense-shortcuts">{[['paid','Paid'],['partial','Partly paid'],['unpaid','Pay later']].map(([value,label])=><button type="button" className="secondary" aria-pressed={form.payment_state===value} key={value} onClick={()=>change('payment_state',value)}>{label}</button>)}</div></div>
   {form.payment_state==='partial'&&field('initial_amount','Amount paid now (₹)',{type:'number',required:true,min:'.01',step:'.01',max:form.amount})}
   {['paid','partial'].includes(form.payment_state)&&<div className="grid gap-4 sm:grid-cols-2">{field('paid_date','Payment date',{type:'date',min:form.expense_date,max:today,required:true})}<label>Payment method<select value={form.method} onChange={e=>change('method',e.target.value)}>{['UPI','CASH','CARD','BANK'].map(m=><option key={m}>{m}</option>)}</select></label></div>}
  </>}
  {(!isEdit&&['unpaid','partial'].includes(form.payment_state)||isEdit)&&field('due_date','Pay by (optional)',{type:'date'})}
  <details className="expense-details" open={locked||undefined}><summary>More details · supplier, receipt and bill measurements</summary><div className="grid gap-4 sm:grid-cols-2 mt-4">
   {field('vendor','Supplier / paid to (optional)',{maxLength:100})}{field('description','Short note (optional)',{maxLength:250})}
   <label>Paid by<select value={form.paid_by} disabled={locked||form.cost_kind.startsWith('OWNER_')} onChange={e=>change('paid_by',e.target.value)}><option value="PROPERTY">Property funds</option><option value="STAFF">Staff member · reimburse later</option></select></label>{form.paid_by==='STAFF'&&field('staff_name','Staff member to reimburse',{required:true,minLength:2,maxLength:100,disabled:locked})}
   {isOwner&&<label>Entry type<select value={form.cost_kind} disabled={locked} onChange={e=>{change('cost_kind',e.target.value);if(e.target.value.startsWith('OWNER_'))change('paid_by','PROPERTY');}}>{Object.entries(costKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
   {form.category==='ELECTRICITY'&&field('units_consumed','Electricity units (kWh, optional)',{type:'number',min:0,step:'.01'})}
   {form.category==='ELECTRICITY'&&<>{field('billing_from','Billing period starts (optional)',{type:'date'})}{field('billing_to','Billing period ends (optional)',{type:'date',min:form.billing_from})}</>}
   {form.category==='LAUNDRY'&&<>{field('laundry_quantity','Laundry quantity (optional)',{type:'number',min:'.01',step:'.01'})}<label>Quantity measured in<select value={form.laundry_unit} onChange={e=>change('laundry_unit',e.target.value)}><option value="">Choose if quantity entered</option><option value="PIECES">Pieces</option><option value="KG">Kilograms</option></select></label></>}
   <label className="sm:col-span-2">Receipt photo or PDF (optional, up to 5 MB)<input className="expense-upload" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{setFile(e.target.files[0]||null);uploaded.current='';}}/>{form.receipt_path&&<small>A receipt is attached. Uploading replaces it.</small>}</label>
  </div><label className="flex gap-2 items-center mt-4"><input type="checkbox" checked={form.repeat_monthly} onChange={e=>change('repeat_monthly',e.target.checked)}/>Remind me to review this bill next month</label><p className="muted">A reminder does not create a bill or mark it paid. Equipment, deposits and owner movements are kept out of operating expenses.</p></details>
  {isEdit&&<><label>Why are you correcting this entry?<input required minLength={2} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/></label>{locked&&<p className="muted">Payment history is preserved. Use Record payment or Supplier refund for money movements.</p>}</>}
  <p className="muted">This records an expense; it does not transfer money. Enter each bill once.</p><button className="primary">{busy?'Saving…':isEdit?'Save correction':'Save expense'}</button>
 </fieldset></form>{duplicate&&<ExpenseDialog title="Possible duplicate expense" onClose={()=>setDuplicate(false)}><p>A bill with the same date, category, supplier and amount already exists. Is this a separate purchase?</p><div className="flex gap-3 mt-5"><button autoFocus className="secondary" onClick={()=>setDuplicate(false)}>Go back and check</button><button className="primary" disabled={busy} onClick={()=>{setDuplicate(false);save(null,true);}}>Save separate purchase</button></div></ExpenseDialog>}</div>;
}
