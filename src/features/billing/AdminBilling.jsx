import AppLoader from '../../components/ui/AppLoader';
import {useEffect,useState,useRef} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {adminRpc} from '../../services/platformAdmin';
import {chargeTypes,emptyTax} from './billingMath';
import BillingFolio from './BillingFolio';
import './billing.css';

export function AdminBillingProfile({property,onDirtyChange}){
 const query=useQuery({queryKey:['billing-profile',property.id],queryFn:()=>adminRpc('stayman_billing_profile',{p_property:property.id})}),client=useQueryClient();
 const dirty=useRef(false);
 const [form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(query.data&&!dirty.current)setForm({legal_name:query.data.legal_name||property.name,billing_address:query.data.billing_address||property.address||'',email:query.data.email||'',gstin:query.data.gstin||'',invoice_prefix:'INV',...query.data,catalog:Object.fromEntries([['ACCOMMODATION','Accommodation'],...chargeTypes].map(([key])=>[key,{...emptyTax(),...query.data.catalog?.[key]}]))});},[query.data,property.id]);
 async function save(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{await adminRpc('stayman_save_billing_profile',{p_property:property.id,p_settings:form});dirty.current=false;onDirtyChange?.(false);await client.invalidateQueries({queryKey:['billing-profile',property.id]});await client.invalidateQueries({queryKey:['folio']});setMessage('Billing configuration saved. Issued invoices remain unchanged.');}
  catch(err){setError(err.message);}finally{setBusy(false);}
 }
 if(query.isPending)return <AppLoader label="Loading billing configuration..."/>;
 if(query.error)return <p className="error">Billing configuration is unavailable. Apply the billing migration before using this section.</p>;
 if(!form)return null;
 const field=(key,label,extra={})=><label>{label}<input {...extra} value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 return <form onSubmit={save} onChangeCapture={()=>{dirty.current=true;onDirtyChange?.(true);}} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><h2>Billing configuration · {property.name}</h2><p className="notice">Only platform administrators can edit this configuration. Confirm registration and charge-specific tax rates before issuing invoices.</p><div className="billing-profile-grid">{field('legal_name','Legal business name',{required:true,minLength:2,maxLength:100})}{field('billing_address','Billing address',{required:true,minLength:2,maxLength:500})}{field('email','Billing email',{type:'email',maxLength:254})}<label>Registration<select value={form.registration} onChange={event=>setForm({...form,registration:event.target.value})}><option value="UNCONFIGURED">Not confirmed yet</option><option value="NOT_REGISTERED">Confirmed: not GST registered</option><option value="REGISTERED">Confirmed: GST registered</option></select></label>{field('gstin','GSTIN',{required:form.registration==='REGISTERED',pattern:'[0-9]{2}[A-Z0-9]{13}',maxLength:15})}<label>Price entry mode<select value={form.price_mode} onChange={event=>setForm({...form,price_mode:event.target.value})}><option value="INCLUSIVE">Tax inclusive</option><option value="EXCLUSIVE">Tax exclusive</option></select></label>{field('invoice_prefix','Invoice prefix',{required:true,pattern:'[A-Z0-9]{1,4}',maxLength:4})}</div>
 <div className="billing-tax-scroll"><div>{[['ACCOMMODATION','Accommodation'],...chargeTypes].map(([key,label])=><div key={key} className="billing-tax-grid"><strong>{label}</strong>{[['cgst_bps','CGST %'],['sgst_bps','SGST %'],['igst_bps','IGST %']].map(([rate,title])=><label key={rate}>{title}<input required type="number" min="0" max="100" step=".01" disabled={form.registration!=='REGISTERED'} value={form.catalog[key][rate]/100} onChange={event=>setForm({...form,catalog:{...form.catalog,[key]:{...form.catalog[key],[rate]:Math.round(Number(event.target.value)*100)}}})}/></label>)}<label>HSN / SAC<input maxLength={8} pattern="[0-9]{0,8}" required={form.registration==='REGISTERED'&&key==='ACCOMMODATION'} value={form.catalog[key].sac} onChange={event=>setForm({...form,catalog:{...form.catalog,[key]:{...form.catalog[key],sac:event.target.value}}})}/></label></div>)}</div></div>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}<button className="primary">{busy?'Saving...':'Save confirmed billing settings'}</button></fieldset></form>;
}

export default function AdminBillingQueue(){
 const query=useQuery({queryKey:['admin-folios'],queryFn:()=>adminRpc('stayman_admin_folio_queue'),refetchInterval:30000}),[selected,setSelected]=useState(null);
 return <section className="card space-y-4"><div className="flex flex-wrap justify-between gap-2"><div><h2>Issued invoices</h2><p className="muted">Owners and managers issue paid invoices after checkout.</p></div><button className="secondary" onClick={()=>query.refetch()}>Refresh</button></div>{query.isPending?<AppLoader label="Loading invoices..."/>:query.error?<p className="muted">Issued invoices will be available after billing setup.</p>:<div className="overflow-x-auto"><table><thead><tr><th>Property / booking</th><th>Guest</th><th>Status</th><th/></tr></thead><tbody>{query.data.map(row=><tr key={row.id}><td>{row.property_name}<small className="block muted">{row.reference}</small></td><td>{row.guest}</td><td>{row.invoice_number||'Not issued'}</td><td><button className="secondary" onClick={()=>setSelected(selected===row.reservation_id?null:row.reservation_id)}>Review</button></td></tr>)}{!query.data.length&&<tr><td colSpan={4}>No issued invoices yet.</td></tr>}</tbody></table></div>}{selected&&<BillingFolio key={selected} reservationId={selected} admin/>}</section>;
}
