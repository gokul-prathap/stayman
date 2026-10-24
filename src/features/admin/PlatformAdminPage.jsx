import AppLoader from '../../components/ui/AppLoader';
import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import AdminPropertyPage from './AdminPropertyPage';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import AdminDirectory,{AdminHome,AdminNavigation} from './AdminDirectory';
import AdminUsers from './AdminUsers';
import AdminActivity from './AdminActivity';
import {AdminDraftGuard} from './AdminSection';
import {supabase} from '../../services/supabase';
import {adminRpc} from '../../services/platformAdmin';
import AdminOtpLogin from './AdminOtpLogin';
import {hasOtpSession} from './adminSession';
import '../management/management.css';
import './admin.css';

function PlatformAdminContent() {
 const location=useLocation(),navigate=useNavigate();
 const [session,setSession]=useState(undefined),[allowed,setAllowed]=useState(null),[properties,setProperties]=useState([]);
 const [error,setError]=useState('');
 const client=useQueryClient();
 const consoleQuery=useQuery({queryKey:['admin-console'],enabled:allowed===true,queryFn:()=>adminRpc('stayman_admin_console'),retry:false});
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
 async function reload(){const rows=await adminRpc('stayman_admin_properties');setProperties(rows);await client.invalidateQueries({queryKey:['admin-console']});return rows;}
 if(session===undefined||(hasOtpSession(session)&&allowed===null))return <AppLoader label="Loading administrator access..."/>;
 if(!hasOtpSession(session))return <AdminOtpLogin/>;
 if(!allowed)return <main className="management p-8 space-y-4"><h1>Platform administrator access required</h1><p>{error||'This account can only access its assigned properties.'}</p><Link className="secondary inline-block" to="/">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></main>;
 const visibleProperties=consoleQuery.data?.properties||properties;
 const setup=location.pathname.match(/^\/godfather\/properties\/(new|[a-f0-9-]+)(?:\/(overview|details|rooms|pricing|users|billing|aiosell|activity))?\/?$/i);
 if(setup){const selected=visibleProperties.find(p=>p.id===setup[1]);if(setup[1]!=='new'&&!selected)return <main className="management p-8"><h1>Property not found</h1><Link to="/godfather/properties">Back to Properties</Link></main>;return <AdminPropertyPage key={setup[1]} property={selected} initialTab={setup[2]||(selected?'overview':'details')} onSaved={reload}/>;}
 return <main className="management admin-workspace p-4 sm:p-8 space-y-5"><header className="admin-hero flex flex-wrap justify-between gap-3"><div><p className="admin-eyebrow">STAYMAN / PLATFORM ADMINISTRATION</p><h1>Your properties, connected.</h1><p className="subtitle">Onboard properties and assign individual owner and staff accounts.</p></div><div className="flex flex-wrap gap-2"><Link to="/" className="secondary">Property workspace</Link><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button><button className="primary" onClick={()=>navigate('/godfather/properties/new')}>Add property</button></div></header>
 {error&&<p role="alert" className="error">{error}</p>}
 <AdminNavigation/>
 {consoleQuery.error&&<p className="notice">Detailed setup status and activity need the pending administration database update. Existing property details remain available.</p>}
 {location.pathname==='/godfather/users'?<AdminUsers properties={visibleProperties} onChanged={reload}/>:location.pathname==='/godfather/properties'?<AdminDirectory properties={visibleProperties}/>:<><AdminHome properties={visibleProperties} snapshot={consoleQuery.data}/><AdminActivity rows={consoleQuery.data?.recent}/></>}

 </main>;
}

export default function PlatformAdminPage(){return <AdminDraftGuard><PlatformAdminContent/></AdminDraftGuard>;}
