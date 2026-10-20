import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {adminRpc,propertyLogo,uploadPropertyLogo} from '../../services/platformAdmin';
import RoomInventory from '../rooms/components/RoomInventory';
import {AdminBillingProfile} from '../billing/AdminBilling';

export default function AdminPropertyPage({property,onSaved}){
 const [form,setForm]=useState(()=>property||{id:crypto.randomUUID(),name:'',address:'',phone:'',timezone:'Asia/Kolkata',owner_email:''});
 const [saved,setSaved]=useState(property||null),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const client=useQueryClient();
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function save(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152))throw new Error('Choose a PNG, JPEG or WebP logo up to 2 MB.');
   await adminRpc('stayman_admin_save_property',{p_id:form.id,p_details:form,p_owner_email:form.owner_email||null});
   if(file)await uploadPropertyLogo(form.id,file);
   const rows=await onSaved();const current=rows.find(row=>row.id===form.id);
   setSaved(current);setForm({...current,owner_email:''});setFile(null);
   await client.invalidateQueries({queryKey:['folio']});
   setMessage('Property and logo saved. Complete the billing settings below before issuing invoices.');
  }catch(err){setError(err.message+' If property creation succeeded before a logo error, retry here to finish setup.');}finally{setBusy(false);}
 }
 const field=(key,label,extra={})=><label>{label}<input {...extra} value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 const logo=preview||(saved?.logo_path?propertyLogo(saved.logo_path):null);
 return <main className="management admin-workspace p-4 sm:p-8 space-y-5"><header className="flex flex-wrap justify-between gap-3"><div><h1>{saved?'Property setup':'Onboard property'}</h1><p className="subtitle">Property identity, logo, owner access and invoice configuration.</p></div><Link className="secondary" to="/godfather">Back to administration</Link></header>
 <form onSubmit={save} className="card"><fieldset disabled={busy} className="space-y-4"><h2>1. Property details and logo</h2><div className="billing-profile-grid">{field('name','Property name',{required:true,minLength:2,maxLength:100})}{field('phone','Contact phone',{maxLength:25})}{field('address','Property address',{required:true,maxLength:500})}{field('timezone','Timezone',{required:true})}{field('owner_email',saved?'Add owner email (optional)':'Owner account email',{type:'email',required:!saved})}<label>Property logo<input key={saved?.logo_path||'new'} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>setFile(event.target.files?.[0]||null)}/><small>PNG, JPEG or WebP, up to 2 MB.</small></label></div>
 <div className="flex items-center gap-4 rounded-xl border p-4">{logo?<img src={logo} alt="Property logo preview" className="h-20 w-32 object-contain"/>:<span className="muted">No logo uploaded yet</span>}<p className="muted">This logo appears on invoice headers. Issued invoices keep the logo and details approved when they were issued.</p></div>
 <p className="muted">The owner must already have a Supabase account. Each person uses their own login. Property and billing changes remain platform-admin only.</p>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}<button className="primary">{busy?'Saving...':saved?'Save property and logo':'Create property and continue'}</button></fieldset></form>
 <section className="card space-y-4"><h2>2. Invoice and tax details</h2>{saved?<AdminBillingProfile key={saved.id} property={saved}/>:<p className="muted">Save the property above to enter its legal business name, billing address, billing email, GST registration, invoice prefix and charge-specific tax settings.</p>}</section>
 {saved&&<section className="card"><RoomInventory property={saved}/></section>}
 </main>;
}
