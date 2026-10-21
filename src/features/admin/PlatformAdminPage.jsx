import AppLoader from '../../components/ui/AppLoader';
import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import AdminPropertyPage from './AdminPropertyPage';
import StaffInvitations from './StaffInvitations';
import {supabase} from '../../services/supabase';
import {adminRpc,propertyLogo} from '../../services/platformAdmin';
import AdminOtpLogin from './AdminOtpLogin';
import {hasOtpSession} from './adminSession';
import AdminBillingQueue from '../billing/AdminBilling';
import '../management/management.css';
import './admin.css';

export default function PlatformAdminPage() {
 const location=useLocation(),navigate=useNavigate();
 const [session,setSession]=useState(undefined),[allowed,setAllowed]=useState(null),[properties,setProperties]=useState([]);
 const [error,setError]=useState('');
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
   if(!active)return;
   if(ok){const rows=await adminRpc('stayman_admin_properties');if(active){setProperties(rows);setAllowed(true);}}else setAllowed(false);
  }).catch(err=>{if(active){setAllowed(false);setError(err.message);}});
  return()=>{active=false;};
 },[session?.access_token]);
 async function reload(){const rows=await adminRpc('stayman_admin_properties');setProperties(rows);return rows;}
 if(session===undefined||(hasOtpSession(session)&&allowed===null))return <AppLoader label="Loading administrator access..."/>;
 if(!hasOtpSession(session))return <AdminOtpLogin/>;
 if(!allowed)return <main className="management p-8 space-y-4"><h1>Platform administrator access required</h1><p>{error||'This account can only access its assigned properties.'}</p><Link className="secondary inline-block" to="/">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></main>;
 const setup=location.pathname.match(/^\/godfather\/properties\/(new|[a-f0-9-]+)\/?$/i);
 if(setup){const selected=properties.find(p=>p.id===setup[1]);if(setup[1]!=='new'&&!selected)return <main className="management p-8"><h1>Property not found</h1><Link to="/godfather">Back to administration</Link></main>;return <AdminPropertyPage key={setup[1]} property={selected} onSaved={reload}/>;}
 return <main className="management admin-workspace p-4 sm:p-8 space-y-5"><header className="admin-hero flex flex-wrap justify-between gap-3"><div><p className="admin-eyebrow">STAYMAN / PLATFORM ADMINISTRATION</p><h1>Your properties, connected.</h1><p className="subtitle">Onboard properties and assign individual owner and staff accounts.</p></div><div className="flex flex-wrap gap-2"><Link to="/" className="secondary">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button><button className="primary" onClick={()=>navigate('/godfather/properties/new')}>Add property</button></div></header>
 {error&&<p role="alert" className="error">{error}</p>}
 <div className="admin-summary"><div><strong>{properties.length}</strong><span>Properties onboarded</span></div><div><strong>{new Set(properties.flatMap(p=>p.team.map(m=>m.user_id))).size}</strong><span>Team accounts</span></div><div><strong>Admin only</strong><span>Profile & billing changes</span></div></div>
 <StaffInvitations properties={properties} onChanged={reload}/>
 <section className="card space-y-4"><h2>Properties ({properties.length})</h2>{!properties.length&&<p className="muted">Add your first property to get started.</p>}<div className="grid gap-4 md:grid-cols-2">{properties.map(p=><article key={p.id} className="admin-property-card space-y-3"><div className="flex items-center gap-3">{!p.logo_path&&<span className="admin-property-avatar">{p.name.charAt(0).toUpperCase()}</span>}{p.logo_path&&<img src={propertyLogo(p.logo_path)} alt={p.name+' logo'} className="h-12 w-12 object-contain rounded-lg"/>}<div><h2>{p.name}</h2><p className="muted">{p.address||'Address not set'}</p></div></div><ul className="text-sm space-y-1">{p.team.map(m=><li key={m.user_id}>{m.email} · {m.role==='OWNER'?'Owner':'Manager'}</li>)}</ul><div className="flex flex-wrap gap-2"><button className="secondary" onClick={()=>navigate('/godfather/properties/'+p.id)}>Property setup / logo</button><button type="button" className="secondary" onClick={()=>navigate('/godfather/properties/'+p.id)}>Billing settings</button><a className="secondary" href={'/guest-check-in?property='+p.id} target="_blank" rel="noreferrer">Guest check-in</a></div></article>)}</div></section>
 <AdminBillingQueue/>
 </main>;
}
