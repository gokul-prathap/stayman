import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link,useLocation} from 'react-router-dom';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
import {useExpenseList,useExpenseRefresh,expenseRpc,expenseError} from '../hooks/useExpenseData';
import ExpenseForm,{ExpenseDialog} from '../components/ExpenseForm';
import {expenseCategories} from '../utils/operations';
import {dayInZone,money,rupeesToPaise,nights} from '../utils/metrics';
import {monthStart,categoryLabel,costKinds,downloadCsv} from '../utils/expenseReports';
import '../management.css';
import '../components/expense-reports.css';
import '../components/expense-layout.css';

function Receipt({path}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);try{const {data,error}=await db().storage.from('expense-receipts').createSignedUrl(path,120);if(error)throw error;setUrl(data.signedUrl);}catch(e){setError(expenseError(e));}finally{setBusy(false);}}
 return <span>{url?<a className="secondary inline-block" target="_blank" rel="noopener noreferrer" href={url}>Open receipt</a>:<button className="secondary" disabled={busy} onClick={load}>{busy?'Loading...':'View receipt'}</button>}{error&&<small role="alert">{error}</small>}</span>;
}
function History({expense,onClose}){
 const query=useQuery({queryKey:['expense-history',expense.id],queryFn:()=>expenseRpc('stayman_expense_history',{p_expense:expense.id})});
 return <ExpenseDialog title={expense.description+' · History'} onClose={onClose}>{query.isPending?<p>Loading...</p>:query.error?<p role="alert">{expenseError(query.error)}</p>:<><h3>Payments and refunds</h3>{query.data.payments.length?<div className="overflow-x-auto"><table><thead><tr><th>Date</th><th>Action</th><th>Amount</th><th>Source</th><th>Recorded by</th></tr></thead><tbody>{query.data.payments.map(p=><tr key={p.id}><td>{p.payment_date}</td><td>{categoryLabel(p.kind)} · {p.method}</td><td>{money(p.amount_paise)}</td><td>{p.source==='STAFF'?expense.staff_name:'Property'}</td><td>{p.actor_label||'Staff member'}</td></tr>)}</tbody></table></div>:<p>No payments recorded.</p>}<h3 className="mt-4">Entry activity</h3>{query.data.events.map(e=><p key={e.id} className="muted mt-2">{e.created_at} · {e.action} · {e.note} · Recorded by {e.actor_label||'Staff member'}</p>)}</>}</ExpenseDialog>;
}
function PaymentAction({action,today,onClose,onSaved}){
 const e=action.expense,kind=action.kind,b=e.balance||{},remaining=Number(e.amount_paise)-Number(b.paid||0);
 const limit=kind==='PAYMENT'?remaining:kind==='REIMBURSEMENT'?Number(b.staffOwed||0):Number(b.paid||0)-Number(b.refunded||0);
 const [amount,setAmount]=useState(String(limit/100)),[day,setDay]=useState(today),[method,setMethod]=useState('UPI'),[source,setSource]=useState(kind==='PAYMENT'?e.paid_by:'PROPERTY'),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(crypto.randomUUID());
 const title=kind==='VOID'?'Remove incorrect entry':kind==='REFUND'?'Record supplier refund':kind==='REIMBURSEMENT'?'Reimburse staff member':'Record bill payment';
 async function save(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{
  if(kind==='VOID')await expenseRpc('stayman_void_expense',{p_expense:e.id,p_reason:reason});
  else await expenseRpc('stayman_expense_payment',{p_expense:e.id,p_kind:kind,p_amount:rupeesToPaise(amount),p_day:day,p_method:method,p_source:source,p_request:request.current,p_note:reason});
  onSaved(kind==='VOID'?'Incorrect entry removed from totals.':'Payment history updated.');
 }catch(err){setError(expenseError(err));}finally{setBusy(false);}}
 return <ExpenseDialog title={title} onClose={()=>!busy&&onClose()}><form onSubmit={save} className="space-y-4"><p>{e.description} · Bill {money(e.amount_paise)}</p>{error&&<p role="alert" className="error">{error}</p>}<fieldset disabled={busy} className="space-y-4">{kind==='VOID'?<><p>This removes the incorrect entry and its payments from reports. It does not refund money. For a real supplier refund, use Record supplier refund.</p><label>Reason<input required minLength={2} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/></label></>:<>
 <p>{kind==='PAYMENT'?'Remaining bill amount':kind==='REIMBURSEMENT'?`Owed to ${e.staff_name}`:'Maximum refund'}: {money(limit)}</p><label>Amount (₹)<input type="number" required min=".01" max={limit/100} step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Date<input type="date" required min={e.expense_date} max={today} value={day} onChange={e=>setDay(e.target.value)}/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}>{['UPI','CASH','CARD','BANK'].map(m=><option key={m}>{m}</option>)}</select></label>{kind==='REFUND'&&<label>Who received the refund?<select value={source} onChange={e=>setSource(e.target.value)}><option value="PROPERTY">Property</option><option value="STAFF">Staff member</option></select></label>}<label>Note (optional)<input maxLength={250} value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="muted">Record money already moved. This does not initiate a transfer.</p></>}
 <div className="flex gap-3"><button type="button" autoFocus className="secondary" onClick={onClose}>Cancel</button><button className="primary">{busy?'Saving...':'Confirm'}</button></div></fieldset></form></ExpenseDialog>;
}
function ExpenseDescription({expense:e}){
 return <div className="expense-description"><strong>{categoryLabel(e.category)}</strong>{e.description&&e.description.toLowerCase()!==e.category.toLowerCase()&&<p title={e.description}>{e.description}</p>}{e.vendor&&<small>{e.vendor}</small>}{e.cost_kind!=='OPERATING'&&<small>{costKinds[e.cost_kind]}</small>}{e.void_reason&&<small>Removed: {e.void_reason}</small>}{e.receipt_path&&<small>Receipt attached</small>}</div>;
}
function ExpenseStatus({expense:e,through}){
 const b=e.balance||{},due=Math.max(0,Number(e.amount_paise)-Number(b.paid||0));
 return <div className="expense-status-block"><span className="expense-status">{e.voided_at?'Removed':due?`${e.due_date&&e.due_date<through?'Overdue':'Unpaid'} ${money(due)}`:'Paid'}</span>{due>0&&e.due_date&&<small>Due {e.due_date}</small>}{due>0&&Number(b.paid)>0&&<small>Paid {money(b.paid)}</small>}{Number(b.refunded)>0&&<small>Refunded {money(b.refunded)}</small>}{Number(b.staffOwed)>0&&<small>Owed to {e.staff_name}: {money(b.staffOwed)}</small>}</div>;
}
export default function ExpensesPage(){
 const location=useLocation();
 const {property}=useStaff(),today=dayInZone(new Date(),property.timezone),params=new URLSearchParams(location.search);
 const [from,setFrom]=useState(params.get('from')||monthStart(today)),[to,setTo]=useState(params.get('to')||today),[category,setCategory]=useState(params.get('category')||''),[status,setStatus]=useState(params.get('status')||'all');
 const [search,setSearch]=useState(''),[term,setTerm]=useState(''),[page,setPage]=useState(1),[expanded,setExpanded]=useState(params.get('add')==='1'),[editing,setEditing]=useState(null),[repeat,setRepeat]=useState(false),[action,setAction]=useState(null),[history,setHistory]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[opening,setOpening]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
 const valid=from&&to&&from<=to&&nights(from,to)<=365;
 const query=useExpenseList({from:valid?from:'',to,page,search:term,category,status}),refresh=useExpenseRefresh(),card=useRef(null);
 const summary=useQuery({queryKey:['expenses',property.id,'summary',from,to],enabled:!!valid,queryFn:()=>expenseRpc('stayman_expense_totals',{p_property:property.id,p_from:from,p_to:to})});
 useEffect(()=>{const timer=setTimeout(()=>{setPage(1);setTerm(search);},300);return()=>clearTimeout(timer);},[search]);
 const previousProperty=useRef(property.id);
 useEffect(()=>{if(previousProperty.current===property.id)return;previousProperty.current=property.id;setExpanded(false);setEditing(null);setRepeat(false);setAction(null);setHistory(null);setMessage('');setError('');},[property.id]);
 useEffect(()=>{if(new URLSearchParams(location.search).get('add')==='1'){setEditing(null);setRepeat(false);setExpanded(true);}},[location.search]);
 const repeatId=params.get('repeat');
 const recurring=useQuery({queryKey:['expense-repeat',property.id,repeatId],enabled:!!repeatId,queryFn:()=>expenseRpc('stayman_expense_history',{p_expense:repeatId})});
 useEffect(()=>{if(recurring.data?.expense){setEditing(recurring.data.expense);setRepeat(true);setExpanded(true);}},[recurring.data]);
 const data=query.data,totals=summary.data,pages=Math.max(1,Math.ceil(Number(data?.total||0)/25));
 useEffect(()=>{if(data&&page>pages)setPage(pages);},[data,page,pages]);
 async function openEntry(entry,kind){
  if(opening)return;setOpening(true);setError('');
  try{const result=await expenseRpc('stayman_expense_history',{p_expense:entry.id}),current=result.expense;
   if(kind==='EDIT'){setEditing(current);setRepeat(false);setExpanded(true);card.current?.scrollIntoView({block:'start'});}
   else setAction({kind,expense:current});
  }catch(e){setError(expenseError(e));}finally{setOpening(false);}
 }
 async function saved(text){setExpanded(false);setEditing(null);setAction(null);setMessage(text);await refresh();}
 async function exportEntries(){setExporting(true);setError('');try{
  const rows=[['Expense history',property.name],['Bill dates',from,to],['Status filter',status],['Historical balances are measured at',to],['Bill date','Category','Type','Description','Supplier','Bill INR','Paid as of end INR','Supplier refunds as of end INR','Unpaid as of end INR','Staff owed INR','Due date','Payer','Staff member','Removed','Receipt attached']];
  for(let p=1;;p++){
   const result=await expenseRpc('stayman_expense_list',{p_property:property.id,p_from:from,p_to:to,p_page:p,p_search:term,p_category:category,p_status:status,p_size:100});
   for(const e of result.expenses){const b=e.balance;rows.push([e.expense_date,categoryLabel(e.category),costKinds[e.cost_kind],e.description,e.vendor,Number(e.amount_paise)/100,Number(b.paid)/100,Number(b.refunded)/100,Math.max(0,Number(e.amount_paise)-Number(b.paid))/100,Number(b.staffOwed)/100,e.due_date,e.paid_by,e.staff_name,e.voided_at?'Yes':'No',e.receipt_path?'Yes':'No']);}
   if(p*100>=result.total)break;
  }
  downloadCsv(`stayman-expenses-${from}-${to}.csv`,rows);
 }catch(e){setError(expenseError(e));}finally{setExporting(false);}}
 function renderActions(e){
  const b=e.balance||{},due=Math.max(0,Number(e.amount_paise)-Number(b.paid||0));
  return <div className="expense-action-items"><button className="secondary" onClick={()=>setHistory(e)}>History</button>{e.receipt_path&&<Receipt path={e.receipt_path}/>} {!e.voided_at&&<><button className="secondary" disabled={opening} onClick={()=>openEntry(e,'EDIT')}>Edit</button>{due>0&&<button className="secondary" disabled={opening} onClick={()=>openEntry(e,'PAYMENT')}>Record payment</button>}{Number(b.staffOwed)>0&&<button className="secondary" disabled={opening} onClick={()=>openEntry(e,'REIMBURSEMENT')}>Reimburse staff</button>}{Number(b.paid)>Number(b.refunded)&&!e.cost_kind.startsWith('OWNER_')&&<button className="secondary" disabled={opening} onClick={()=>openEntry(e,'REFUND')}>Supplier refund</button>}{e.repeat_monthly&&<button className="secondary" onClick={()=>{setEditing(e);setRepeat(true);setExpanded(true);card.current?.scrollIntoView({block:'start'});}}>Repeat next bill</button>}{data.isOwner&&<button className="secondary expense-remove" disabled={opening} onClick={()=>openEntry(e,'VOID')}>Remove incorrect entry</button>}</>}</div>;
 }
 return <section className="management expenses-page space-y-5"><header className="expense-page-header"><div><h1>Expenses & Bills</h1><p className="subtitle">Record each bill once. Track payments and what is still owed.</p></div><div className="expense-page-tools"><button className="secondary" disabled={!valid||exporting||!data} onClick={exportEntries}>{exporting?'Preparing all entries...':'Download expenses CSV'}</button>{data?.isOwner&&<Link className="secondary" to="/reports">Income & Expenses report</Link>}</div></header>
  {(error||query.error||summary.error||recurring.error)&&<p role="alert" className="error">{error||expenseError(query.error||summary.error||recurring.error)}</p>}{message&&<p role="status" className="success">{message}</p>}

  {!valid&&<p role="alert" className="error">Choose a date range of up to 366 days.</p>}
  {totals&&valid&&<div className="finance-metrics">{[['Operating expenses',totals.incurred],['Operating costs paid',totals.paid],['Bills unpaid at end date',totals.unpaid],['Staff reimbursements due',totals.staffOwed]].map(([label,value])=><article className="card" key={label}><p className="muted">{label}</p><p className="metric">{money(value)}</p></article>)}</div>}
  <div ref={card}>{expanded?<ExpenseForm key={property.id+(editing?.id||'new')+repeat} editing={editing} repeat={repeat} isOwner={data?.isOwner} onClose={()=>{setExpanded(false);setEditing(null);setRepeat(false);}} onSaved={saved}/>:<button className="primary" onClick={()=>{setEditing(null);setRepeat(false);setExpanded(true);setMessage('');}}>+ Add expense</button>}</div>
  <details className="card expense-filters" open={filtersOpen} onToggle={e=>setFiltersOpen(e.currentTarget.open)}><summary>Search expenses filter <span>{from} to {to}{category?" / "+categoryLabel(category):""}{status!=="all"?" / "+status:""}</span></summary><div className="expense-filter-grid"><label>Bill dates from<input type="date" value={from} onChange={e=>{setPage(1);setFrom(e.target.value);}}/></label><label>Through<input type="date" value={to} max={today} min={from} onChange={e=>{setPage(1);setTo(e.target.value);}}/></label><label>Find an expense<input type="search" placeholder="Supplier, note or staff" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Show<select value={status} onChange={e=>{setPage(1);setStatus(e.target.value);}}>{[['all','All entries'],['unpaid','Unpaid bills'],['overdue','Overdue bills'],['staff','Staff reimbursements'],['missing_receipt','Missing receipts']].map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label><label>Category<select value={category} onChange={e=>{setPage(1);setCategory(e.target.value);}}><option value="">All categories</option>{expenseCategories.map(c=><option value={c} key={c}>{categoryLabel(c)}</option>)}</select></label><button className="secondary self-end" onClick={refresh} disabled={query.isFetching}>Refresh</button></div></details>
  <div className="card expense-history"><div className="expense-history-heading"><h2>Expense history</h2><span className="muted">{data?.total||0} entries</span></div><details className="expense-history-help"><summary>About these figures</summary><p className="muted">Costs use bill dates; cash uses payment dates. Balances are as of {to}. Outstanding filters include older bills. Summary cards cover all categories, regardless of list search.</p></details>{query.isPending&&valid&&<p role="status">Loading expenses...</p>}<div className="expense-history-list">{(data?.expenses||[]).map(e=><details key={e.id} className={'expense-history-row expense-mobile-entry'+(e.voided_at?' expense-removed':'')}><summary><time dateTime={e.expense_date} title={e.expense_date}>{new Date(e.expense_date+'T00:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'})}</time><span className="expense-row-label" title={e.description}>{e.description||categoryLabel(e.category)}</span><strong>{money(e.amount_paise)}</strong><span className="expense-row-chevron" aria-hidden="true">&#8964;</span></summary><div className="expense-row-details"><p className="muted mb-2">Bill date: {e.expense_date}</p><div className="expense-entry-main"><ExpenseDescription expense={e}/><ExpenseStatus expense={e} through={to}/></div>{renderActions(e)}</div></details>)}{data&&!data.expenses.length&&<p>No expenses match these filters.</p>}</div></div>
  <div className="expense-pagination"><button className="secondary" disabled={page<=1||query.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pages} · {data?.total||0} entries</span><button className="secondary" disabled={page>=pages||query.isFetching} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  {action&&<PaymentAction key={action.expense.id+action.kind} action={action} today={today} onClose={()=>setAction(null)} onSaved={saved}/>} {history&&<History expense={history} onClose={()=>setHistory(null)}/>}
 </section>;
}
