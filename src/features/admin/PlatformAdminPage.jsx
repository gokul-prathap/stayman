import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '../../services/supabase';
import {adminRpc,propertyLogo,uploadPropertyLogo} from '../../services/platformAdmin';
import AdminOtpLogin from './AdminOtpLogin';
import {hasOtpSession} from './adminSession';
import '../management/management.css';

const blank=()=>({id:crypto.randomUUID(),name:'',address:'',phone:'',timezone:'Asia/Kolkata',owner_email:''});
export default function PlatformAdminPage() {
 const [session,setSession]=useState(undefined),[allowed,setAllowed]=useState(null),[properties,setProperties]=useState([]);
 const [form,setForm]=useState(null),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [staff,setStaff]=useState({property:'',email:'',role:'MANAGER'});
 useEffect(()=>{
  if(!supabase){setSession(null);setError('Supabase is not configured.');return;}
  let active=true;
  supabase.auth.getSession().then(({data,error})=>{if(active){setSession(data.session);if(error)setError(error.message);}});
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{if(active)setSession(next);});
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  let active=true;setAllowed(null);setProperties([]);
  if(hasOtpSession(session))adminRpc('stayman_is_platform_admin').then(async ok=>{
   if(!active)return;setAllowed(ok);
   if(ok){const rows=await adminRpc('stayman_admin_properties');if(active)setProperties(rows);}
  }).catch(err=>{if(active){setAllowed(false);setError(err.message);}});
  return()=>{active=false;};
 },[session?.access_token]);
 async function reload(){setProperties(await adminRpc('stayman_admin_properties'));}
 async function save(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try {
   if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152))throw new Error('Choose a PNG, JPEG or WebP logo up to 2 MB.');
   await adminRpc('stayman_admin_save_property',{p_id:form.id,p_details:form,p_owner_email:form.owner_email||null});
   // Keep the same ID on retry if logo upload fails after property creation.
   if(file)await uploadPropertyLogo(form.id,file);
   await reload();setForm(null);setFile(null);setMessage('Property saved. Its owner can now sign in.');
  }catch(err){setError(err.message+' If property details were saved before an upload error, retry to finish the logo upload.');}finally{setBusy(false);}
 }
 async function addStaff(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try {await adminRpc('stayman_admin_add_staff',{p_property:staff.property,p_email:staff.email,p_role:staff.role});await reload();setStaff(s=>({...s,email:''}));setMessage('Property access assigned.');}
  catch(err){setError(err.message);}finally{setBusy(false);}
 }
 if(session===undefined||(hasOtpSession(session)&&allowed===null))return <p role="status" className="p-8">Loading administrator access...</p>;
 if(!hasOtpSession(session))return <AdminOtpLogin/>;
 if(!allowed)return <main className="management p-8 space-y-4"><h1>Platform administrator access required</h1><p>{error||'This account can only access its assigned properties.'}</p><Link className="secondary inline-block" to="/">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></main>;
 const field=(key,label,extra={})=><label>{label}<input {...extra} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
 return <main className="management p-4 sm:p-8 space-y-5"><header className="flex flex-wrap justify-between gap-3"><div><h1>Platform administration</h1><p className="subtitle">Onboard properties and assign individual owner and staff accounts.</p></div><div className="flex flex-wrap gap-2"><Link to="/" className="secondary">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button><button className="primary" disabled={busy} onClick={()=>{setForm(blank());setFile(null);setError('');}}>Add property</button></div></header>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 {form&&<form onSubmit={save} className="card"><fieldset disabled={busy} className="space-y-4"><h2>{properties.some(p=>p.id===form.id)?'Edit property':'Onboard property'}</h2><div className="grid gap-4 sm:grid-cols-2">{field('name','Property name',{required:true,minLength:2,maxLength:100})}{field('phone','Contact phone',{maxLength:25})}{field('address','Address',{maxLength:500})}{field('timezone','Timezone',{required:true})}{field('owner_email','Owner email (existing account)',{type:'email',required:!properties.some(p=>p.id===form.id)})}<label>Logo (PNG, JPEG or WebP, up to 2 MB)<input key={form.id} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div><p className="muted">Create the owner account in Supabase Authentication first. Adding an owner preserves existing owners.</p><div className="flex gap-2"><button className="primary">{busy?'Saving...':'Save property'}</button><button type="button" className="secondary" onClick={()=>{setForm(null);setFile(null);}}>Cancel</button></div></fieldset></form>}
 <section className="card space-y-4"><h2>Properties ({properties.length})</h2>{!properties.length&&<p className="muted">Add your first property to get started.</p>}<div className="grid gap-4 md:grid-cols-2">{properties.map(p=><article key={p.id} className="rounded-xl border p-4 space-y-3"><div className="flex items-center gap-3">{p.logo_path&&<img src={propertyLogo(p.logo_path)} alt={p.name+' logo'} className="h-12 w-12 object-contain rounded-lg"/>}<div><h2>{p.name}</h2><p className="muted">{p.address||'Address not set'}</p></div></div><ul className="text-sm space-y-1">{p.team.map(m=><li key={m.user_id}>{m.email} · {m.role==='OWNER'?'Owner':'Manager'}</li>)}</ul><div className="flex flex-wrap gap-2"><button className="secondary" disabled={busy} onClick={()=>{setForm({...p,owner_email:''});setFile(null);}}>Edit / upload logo</button><a className="secondary" href={'/guest-check-in?property='+p.id} target="_blank" rel="noreferrer">Guest check-in</a></div></article>)}</div></section>
 <form onSubmit={addStaff} className="card"><fieldset disabled={busy} className="space-y-4"><h2>Assign property access</h2><p className="muted">Use a separate existing account for each person. Manager is the current operational staff role.</p><div className="grid gap-4 sm:grid-cols-3"><label>Property<select required value={staff.property} onChange={e=>setStaff({...staff,property:e.target.value})}><option value="">Choose property</option>{properties.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>Account email<input type="email" required value={staff.email} onChange={e=>setStaff({...staff,email:e.target.value})}/></label><label>Role<select value={staff.role} onChange={e=>setStaff({...staff,role:e.target.value})}><option value="MANAGER">Manager / reception</option><option value="OWNER">Owner</option></select></label></div><button className="primary">Assign access</button></fieldset></form>
 </main>;
}
