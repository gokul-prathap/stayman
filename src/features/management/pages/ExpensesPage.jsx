import AppLoader from '../../../components/ui/AppLoader';
import {IndianRupee,Plus,X} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {useStaff} from '../../../components/auth/StaffGate';
import {useOperations,operationsMutation,operationsError} from '../hooks/useOperations';
import {dayInZone,money,rupeesToPaise} from '../utils/metrics';
import {expenseCategories} from '../utils/operations';
import '../management.css';
const label=value=>value.charAt(0)+value.slice(1).toLowerCase();
export default function ExpensesPage() {
 const {property}=useStaff();
 const today=dayInZone(new Date(),property.timezone);
 const [from,setFrom]=useState(()=>today.slice(0,8)+'01'),[to,setTo]=useState(today);
 const [page,setPage]=useState(1);
 const {data,isPending,error,refresh}=useOperations({mode:'expenses',from,to,page});
 const pages=Math.max(1,Math.ceil((data?.total||0)/25));
 useEffect(()=>setPage(1),[from,to]);
 useEffect(()=>{if(data&&page>pages)setPage(pages);},[data,page,pages]);
 const blank=()=>({category:'ELECTRICITY',description:'',vendor:'',amount:'',expense_date:today,due_date:'',units_consumed:'',paid_date:today,method:'UPI',paid:true});
 const [form,setForm]=useState(blank),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState('');
 const [pay,setPay]=useState(null),[voiding,setVoiding]=useState(null),[reason,setReason]=useState('');
 const request=useRef(null),expenseCard=useRef(null);
 const [expanded,setExpanded]=useState(()=>new URLSearchParams(window.location.search).get('add')==='1'),[editing,setEditing]=useState(null),[editReason,setEditReason]=useState('');
 const change=(key,value)=>{setForm(f=>({...f,[key]:value}));request.current=null;setMessage('');};
 async function save(event) {
  event.preventDefault();setBusy(true);setSaveError('');setMessage('');
  try{
   const amount=rupeesToPaise(form.amount);
   if(amount<=0) throw new Error('Expense amount must be greater than zero.');
   if(form.category==='ELECTRICITY'&&form.units_consumed!==''&&(!Number.isFinite(Number(form.units_consumed))||Number(form.units_consumed)<0)) throw new Error('Enter valid electricity units.');
   request.current ||= crypto.randomUUID();
   const details={...form,amount_paise:amount,units_consumed:form.category==='ELECTRICITY'?form.units_consumed:'',paid_date:form.paid?form.paid_date:'',method:form.paid?form.method:''};
   if(editing){const {created_at,...expected}=editing;await operationsMutation('stayman_edit_expense',{p_expense:editing.id,p_details:details,p_expected:expected,p_reason:editReason});}
   else await operationsMutation('stayman_add_expense',{p_property:property.id,p_request:request.current,p_details:details});
   setForm(blank());setExpanded(false);setEditing(null);setEditReason('');request.current=null;await refresh();setMessage('Expense saved.');
  }catch(err){setSaveError(operationsError(err));}finally{setBusy(false);}
 }
 async function update(event) {
  event.preventDefault();setBusy(true);setSaveError('');setMessage('');
  try{
   if(pay) await operationsMutation('stayman_pay_expense',{p_expense:pay.id,p_day:pay.day,p_method:pay.method});
   else await operationsMutation('stayman_void_expense',{p_expense:voiding.id,p_reason:reason});
   setPay(null);setVoiding(null);setReason('');await refresh();setMessage('Expense updated.');
  }catch(err){setSaveError(operationsError(err));}finally{setBusy(false);}
 }
 const valid=from&&to&&from<=to;
 const summary=data?.summary||{incurred:0,paid:0,unpaid:0,units:0};
 const filtered=(data?.expenses||[]).filter(e=>valid&&e.expense_date>=from&&e.expense_date<=to);
 const field=(key,title,props={})=><label>{title}<input {...props} value={form[key]} onChange={e=>change(key,e.target.value)}/></label>;
 return <section className="management space-y-5"><header><h1>Expenses & Bills</h1><p className="subtitle">Track operating costs, laundry charges, linen purchases and electricity usage.</p></header>
 {error&&<p role="alert" className="error">{operationsError(error)} <button onClick={refresh}>Retry</button></p>}
 {isPending&&<AppLoader label="Loading expenses..."/>}
 {saveError&&<p role="alert" className="error">{saveError}</p>}{message&&<p role="status" className="success">{message}</p>}
 {data&&<><div className="card grid gap-4 sm:grid-cols-2"><label>Expense dates from<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Through<input type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
 {!valid?<p className="error">Choose a valid date range.</p>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Expenses incurred',money(summary.incurred)],['Paid in date range',money(summary.paid)],['Unpaid through end date',money(summary.unpaid)],['Electricity units (kWh)',Number(summary.units).toLocaleString('en-IN')]].map(([title,value])=><article className="card" key={title}><p className="muted">{title}</p><p className="metric">{value}</p></article>)}</div>}
 <div ref={expenseCard} className="card"><button type="button" aria-label={expanded?'Close expense form':'Add expense'} aria-expanded={expanded} aria-controls="expense-details-form" disabled={busy} onClick={()=>{setExpanded(v=>!v);setEditing(null);setEditReason('');setForm(blank());setSaveError('');request.current=null;}} className="flex w-full items-center justify-between gap-3 text-left"><span className="flex items-center gap-3"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-md"><IndianRupee size={23} aria-hidden="true"/></span><span><span className="block text-lg font-semibold">{editing?'Edit expense':'Add expense'}</span><span className="muted block">Record bills and operating costs.</span></span></span>{expanded?<X size={20} aria-hidden="true"/>:<Plus size={20} aria-hidden="true"/>}</button>
 {expanded&&<form id="expense-details-form" className="mt-5 space-y-4 border-t pt-5" onSubmit={save}><fieldset disabled={busy} className="space-y-4"><h2>{editing?'Update expense details':'New expense details'}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label>Category<select value={form.category} onChange={e=>change('category',e.target.value)}>{expenseCategories.map(c=><option key={c}>{c}</option>)}</select></label>{field('description','Description',{required:true,minLength:2,maxLength:250})}{field('amount','Amount (INR)',{type:'number',required:true,min:'.01',max:'100000000',step:'.01'})}{field('expense_date','Expense / bill date',{type:'date',required:true,max:today})}{field('vendor','Vendor / paid to',{maxLength:100})}{field('due_date','Due date (optional)',{type:'date'})}{form.category==='ELECTRICITY'&&field('units_consumed','Units consumed (kWh, optional)',{type:'number',min:0,max:9999999999,step:'.01'})}</div>
 <label className="flex items-center gap-2"><input type="checkbox" checked={form.paid} onChange={e=>change('paid',e.target.checked)}/>Already paid</label>
 {form.paid&&<div className="grid gap-4 sm:grid-cols-2">{field('paid_date','Payment date',{type:'date',required:true,max:today})}<label>Payment method<select value={form.method} onChange={e=>change('method',e.target.value)}>{['CASH','UPI','CARD','BANK'].map(m=><option key={m}>{m}</option>)}</select></label></div>}
 <p className="muted">Enter purchases and laundry charges here once. Stock movements do not create expenses automatically. Paid means money already paid; this form does not transfer money.</p>{editing&&<label>Reason for correction<input required minLength={2} maxLength={250} value={editReason} onChange={e=>setEditReason(e.target.value)}/></label>}<div className="flex gap-2"><button className="primary">{busy?'Saving...':editing?'Save changes':'Save expense'}</button><button type="button" className="secondary" onClick={()=>{setExpanded(false);setEditing(null);}}>Cancel</button></div></fieldset></form>}</div>
 <div className="card"><h2>Expense history</h2><p className="muted mt-2">Amounts are costs on the bill date. Paid totals use the actual payment date. Staff can edit entries with a correction reason. Owners can void incorrect entries.</p><div className="overflow-x-auto mt-4"><table><thead><tr>{['Date','Category / description','Vendor','Units','Amount','Status','Actions'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{filtered.map(e=><tr key={e.id} className={e.voided_at?'opacity-50':''}><td>{e.expense_date}</td><td><strong>{label(e.category)}</strong><p>{e.description}</p>{e.due_date&&<small>Due {e.due_date}</small>}{e.void_reason&&<p>Voided: {e.void_reason}</p>}</td><td>{e.vendor||'—'}</td><td>{e.units_consumed??'—'}</td><td>{money(e.amount_paise)}</td><td>{e.voided_at?'Voided':e.paid_date?'Paid '+e.paid_date:e.due_date&&e.due_date<today?'Overdue':'Unpaid'}</td><td><div className="flex gap-2">{!e.voided_at&&<button disabled={busy} className="secondary" onClick={()=>{setEditing(e);setExpanded(true);setEditReason('');setSaveError('');setForm({...blank(),...e,amount:(Number(e.amount_paise)/100).toFixed(2),units_consumed:e.units_consumed??'',due_date:e.due_date||'',paid:!!e.paid_date,paid_date:e.paid_date||today,method:e.method||'UPI'});requestAnimationFrame(()=>expenseCard.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}>Edit</button>}{!e.voided_at&&!e.paid_date&&<button disabled={busy} className="secondary" onClick={()=>{setPay({id:e.id,day:today,method:'UPI'});setVoiding(null);}}>Mark paid</button>}{!e.voided_at&&data.isOwner&&<button disabled={busy} className="secondary" onClick={()=>{setVoiding(e);setPay(null);setReason('');}}>Void</button>}</div></td></tr>)}{!filtered.length&&<tr><td colSpan="7">No expenses in this date range.</td></tr>}</tbody></table></div></div>
 <div className="flex items-center gap-3"><button className="secondary" disabled={page<=1||isPending} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pages} ? {data?.total||0} expenses</span><button className="secondary" disabled={page>=pages||isPending} onClick={()=>setPage(p=>p+1)}>Next</button></div>
 {(pay||voiding)&&<div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-4"><form onSubmit={update} role="dialog" aria-modal="true" aria-labelledby="expense-action" className="card w-full max-w-md space-y-4"><h2 id="expense-action">{pay?'Record payment':'Void incorrect expense'}</h2><fieldset disabled={busy} className="space-y-4">{pay?<><label>Payment date<input type="date" required max={today} value={pay.day} onChange={e=>setPay(v=>({...v,day:e.target.value}))}/></label><label>Method<select value={pay.method} onChange={e=>setPay(v=>({...v,method:e.target.value}))}>{['CASH','UPI','CARD','BANK'].map(m=><option key={m}>{m}</option>)}</select></label></>:<><p className="muted">This corrects the expense record and removes it from totals. It does not refund money.</p><label>Reason<input required minLength={2} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}
 {saveError&&<p role="alert" className="error">{saveError}</p>}<div className="flex gap-2"><button className="primary">Confirm</button><button type="button" className="secondary" onClick={()=>{setPay(null);setVoiding(null);}}>Cancel</button></div></fieldset></form></div>}
 </>}</section>;
}
