import AppLoader from '../../../components/ui/AppLoader';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useStaff} from '../../../components/auth/StaffGate';
import {useOperations,operationsMutation,operationsError} from '../../management/hooks/useOperations';
import {actionsFor,stockActions,stockTotal,previewMovement} from '../../management/utils/operations';
import '../../management/management.css';
export default function HousekeepingPage() {
 const {property}=useStaff(),{data,isPending,error,refresh}=useOperations();
 const [tab,setTab]=useState('LINEN'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saveError,setSaveError]=useState('');
 const [item,setItem]=useState({name:'',kind:'LINEN',unit:'pieces',low:'2'});
 const [move,setMove]=useState({itemId:'',action:'RECEIVE',quantity:'',note:''});
 const request=useRef(null);
 const selected=data?.items.find(i=>i.id===move.itemId);
 const change=(key,value)=>{setMove(m=>({...m,[key]:value}));request.current=null;setMessage('');};
 async function add(event) {
  event.preventDefault();setBusy(true);setSaveError('');setMessage('');
  try{
   const id=await operationsMutation('stayman_create_stock',{p_property:property.id,p_name:item.name,p_kind:item.kind,p_unit:item.unit,p_low:Number(item.low)});
   await refresh();setMove({itemId:id,action:'RECEIVE',quantity:'',note:''});request.current=null;setTab(item.kind);setItem({...item,name:''});setMessage('Item added. Record its existing stock below.');
  }catch(err){setSaveError(operationsError(err));}finally{setBusy(false);}
 }
 async function record(event) {
  event.preventDefault();setBusy(true);setSaveError('');setMessage('');
  try{
   if(!selected) throw new Error('Choose an item.');
   previewMovement(selected,move.action,move.quantity);request.current ||= crypto.randomUUID();
   await operationsMutation('stayman_move_stock',{p_item:selected.id,p_action:move.action,p_quantity:Number(move.quantity),p_note:move.note,p_request:request.current});
   request.current=null;setMove(m=>({...m,quantity:'',note:''}));await refresh();setMessage('Stock updated.');
  }catch(err){setSaveError(operationsError(err));}finally{setBusy(false);}
 }
 const linen=data?.items.filter(i=>i.kind==='LINEN')||[];
 const totals=Object.fromEntries(['clean','in_use','dirty','laundry'].map(k=>[k,linen.reduce((s,i)=>s+Number(i[k]),0)]));
 const visible=data?.items.filter(i=>i.kind===tab)||[];
 return <section className="management space-y-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1>Laundry, Linen & Supplies</h1><p className="subtitle">Track bedsheets, pillowcases, towels and cleaning supplies across your property.</p></div><Link className="secondary" to="/expenses">Record laundry / cleaning expense</Link></header>
 {isPending&&<AppLoader label="Loading stock..."/>}{error&&<p role="alert" className="error">{operationsError(error)} <button onClick={refresh}>Retry</button></p>}
 {saveError&&<p role="alert" className="error">{saveError}</p>}{message&&<p role="status" className="success">{message}</p>}
 {data&&<><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[['clean','Clean / ready'],['in_use','In use'],['dirty','Dirty / awaiting wash'],['laundry','At laundry']].map(([key,title])=><article className="card" key={key}><p className="muted">{title}</p><p className="metric">{totals[key]}</p><p className="muted">Total linen pieces</p></article>)}</div>
 <p className="notice">Add each linen type separately, such as Bedsheets or Towels. Clean stock is available to issue. Record existing stock once, then move pieces between states; transfers do not increase total stock. Linen movements are recorded manually.</p>
 <div className="tabs" role="tablist" aria-label="Stock type">{[['LINEN','Linen & laundry'],['SUPPLY','Cleaning supplies']].map(([key,title])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>setTab(key)}>{title}</button>)}</div>
 <div className="card overflow-x-auto"><table><thead><tr><th>Item</th><th>{tab==='LINEN'?'Clean / available':'Remaining stock'}</th>{tab==='LINEN'&&<><th>In use</th><th>Dirty</th><th>At laundry</th><th>Total owned</th></>}<th>Low-stock threshold</th></tr></thead><tbody>{visible.map(i=><tr key={i.id}><td><strong>{i.name}</strong><p className="muted">{i.unit}</p></td><td><span className={Number(i.clean)<=Number(i.low_stock)?'text-amber-700 font-semibold':'text-emerald-700'}>{Number(i.clean)}</span>{Number(i.clean)<=Number(i.low_stock)&&<p className="text-xs text-amber-700">Low available stock</p>}</td>{tab==='LINEN'&&<><td>{Number(i.in_use)}</td><td>{Number(i.dirty)}</td><td>{Number(i.laundry)}</td><td>{stockTotal(i)}</td></>}<td>{Number(i.low_stock)}</td></tr>)}{!visible.length&&<tr><td colSpan={tab==='LINEN'?7:3}>No items yet. Owners can add an item below.</td></tr>}</tbody></table></div>
 <form onSubmit={record} className="card"><fieldset disabled={busy||!data.items.length} className="space-y-4"><h2>Record stock movement</h2><div className="grid gap-4 sm:grid-cols-2"><label>Item<select required value={move.itemId} onChange={e=>{setMove(m=>({...m,itemId:e.target.value,action:'RECEIVE'}));request.current=null;}}><option value="">Choose item</option>{data.items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.kind.toLowerCase()})</option>)}</select></label><label>Action<select value={move.action} onChange={e=>change('action',e.target.value)}>{(selected?actionsFor(selected):[['RECEIVE',stockActions.RECEIVE]]).map(([key,v])=><option key={key} value={key}>{v.label}</option>)}</select></label><label>Quantity {selected&&'('+selected.unit+')'}<input type="number" required min={selected?.kind==='LINEN'?1:.01} step={selected?.kind==='LINEN'?1:.01} max={1000000} value={move.quantity} onChange={e=>change('quantity',e.target.value)}/></label><label>Note / laundry vendor (optional)<input maxLength={250} value={move.note} onChange={e=>change('note',e.target.value)}/></label></div><p className="muted">Supply quantities use the chosen unit (for example bottles or litres). Enter laundry, linen purchase and cleaning charges separately in Expenses.</p><button className="primary" disabled={!selected}>{busy?'Saving...':'Save movement'}</button></fieldset></form>
 {data.isOwner&&<form onSubmit={add} className="card"><fieldset disabled={busy} className="space-y-4"><h2>Add stock item</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label>Name<input required minLength={2} maxLength={100} placeholder="Bedsheets" value={item.name} onChange={e=>setItem(i=>({...i,name:e.target.value}))}/></label><label>Type<select value={item.kind} onChange={e=>setItem(i=>({...i,kind:e.target.value,unit:e.target.value==='LINEN'?'pieces':'bottles',low:'2'}))}><option value="LINEN">Linen</option><option value="SUPPLY">Cleaning supply</option></select></label><label>Unit<input required minLength={1} maxLength={20} value={item.unit} onChange={e=>setItem(i=>({...i,unit:e.target.value}))}/></label><label>Low-stock threshold<input type="number" required min={0} max={1000000} step={item.kind==='LINEN'?1:.01} value={item.low} onChange={e=>setItem(i=>({...i,low:e.target.value}))}/></label></div><button className="secondary">Add item</button></fieldset></form>}
 <div className="card"><h2>Recent movements</h2><p className="muted mt-2">The latest 50 movements are shown. All saved movements remain in the database.</p><div className="overflow-x-auto mt-4"><table><thead><tr><th>Date</th><th>Item</th><th>Movement</th><th>Quantity</th><th>Note</th></tr></thead><tbody>{data.movements.slice(0,50).map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('en-IN',{timeZone:property.timezone})}</td><td>{data.items.find(i=>i.id===m.item_id)?.name}</td><td>{stockActions[m.action]?.label||m.action}</td><td>{Number(m.quantity)}</td><td>{m.note||'—'}</td></tr>)}{!data.movements.length&&<tr><td colSpan={5}>No movements recorded.</td></tr>}</tbody></table></div></div>
 </>}</section>;
}
