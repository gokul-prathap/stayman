import AiosellAdminSetup from '../rooms/components/AiosellAdminSetup';
import {useQuery} from '@tanstack/react-query';
import {instagramProfile} from '../../services/propertyBranding';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {adminRpc,propertyLogo,uploadPropertyLogo} from '../../services/platformAdmin';
import RoomInventory from '../rooms/components/RoomInventory';
import {AdminBillingProfile} from '../billing/AdminBilling';
import {useNavigate} from 'react-router-dom';
import AdminSection,{useAdminDrafts} from './AdminSection';
import {AdminNavigation} from './AdminDirectory';
import AdminUsers from './AdminUsers';
import AdminPricing from './AdminPricing';
import AdminActivity from './AdminActivity';
import {AiosellOwnerPanel} from '../rooms/components/AiosellSettings';
import {useCallback} from 'react';
import AdminIssuedInvoices from './AdminIssuedInvoices';

export default function AdminPropertyPage({property,onSaved,initialTab='overview'}){
 const [form,setForm]=useState(()=>property?{...property,check_in_time:(property.check_in_time||'14:00').slice(0,5),check_out_time:(property.check_out_time||'11:00').slice(0,5)}:{id:crypto.randomUUID(),name:'',address:'',phone:'',timezone:'Asia/Kolkata',owner_email:'',tagline:'',instagram_url:'',whatsapp_number:'',facebook_url:'',check_in_time:'14:00',check_out_time:'11:00'});
 const [saved,setSaved]=useState(property||null),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const client=useQueryClient();
 const navigate=useNavigate(),drafts=useAdminDrafts();
 const [visited,setVisited]=useState(()=>new Set([initialTab]));
 useEffect(()=>{setVisited(v=>new Set([...v,initialTab]));},[initialTab]);
 const dirty=useCallback((section,value)=>drafts.setDirty((property?.id||'new')+':'+section,value),[property?.id,drafts.setDirty]);
 useEffect(()=>()=>{for(const section of ['details','billing','rooms','pricing','aiosell','users','extra'])drafts.setDirty((property?.id||'new')+':'+section,false);},[property?.id]);
 const tabs=[['overview','Overview'],['details','Property details'],['rooms','Rooms & beds'],['pricing','Pricing'],['users','Users & access'],['billing','Billing'],['aiosell','Aiosell'],['activity','Activity']];
 function changeTab(tab){if(!drafts.confirmLeave())return;navigate('/godfather/properties/'+(saved?.id||'new')+'/'+tab);}
 const aiosellUnits=useQuery({queryKey:['room-inventory',saved?.id],enabled:!!saved,queryFn:()=>adminRpc('stayman_room_inventory',{p_property:saved.id})});
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function save(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152))throw new Error('Choose a PNG, JPEG or WebP logo up to 2 MB.');
   await adminRpc('stayman_admin_save_property',{p_id:form.id,p_details:{...form,instagram_url:instagramProfile(form.instagram_url),check_in_time:(form.check_in_time||'14:00').slice(0,5),check_out_time:(form.check_out_time||'11:00').slice(0,5)},p_owner_email:form.owner_email||null});
   if(file)await uploadPropertyLogo(form.id,file);
   const rows=await onSaved();const current=rows.find(row=>row.id===form.id);
   setSaved(current);setForm({...current,owner_email:'',check_in_time:(current.check_in_time||'14:00').slice(0,5),check_out_time:(current.check_out_time||'11:00').slice(0,5)});setFile(null);
   await client.invalidateQueries({queryKey:['folio']});
   setMessage('Property and logo saved. Complete the billing settings below before issuing invoices.');
   dirty('details',false);
   if(!property)navigate('/godfather/properties/'+form.id+'/overview',{replace:true});
  }catch(err){setError(err.message+' If property creation succeeded before a logo error, retry here to finish setup.');}finally{setBusy(false);}
 }
 const field=(key,label,extra={})=><label>{label}<input {...extra} value={form[key]||''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 const logo=preview||(saved?.logo_path?propertyLogo(saved.logo_path):null);
 const activeUnits=(aiosellUnits.data?.units||[]).filter(u=>!u.archived_at);
 const unitModels=(aiosellUnits.data?.units||[]).map(u=>({id:u.id,roomName:u.room_name,label:u.label,type:u.unit_type,genderPolicy:u.gender_policy,archivedAt:u.archived_at,nightlyRatePaise:Number(u.nightly_rate_paise)}));
 const inventoryProblem=aiosellUnits.isPending?<p role="status">Loading property inventory...</p>:aiosellUnits.error?<p role="alert" className="error">Property inventory couldn't be loaded. Refresh before editing prices or mappings.</p>:null;
 const sectionDirty=section=>value=>dirty(section,value);
 return <main className="management admin-workspace p-4 sm:p-8 space-y-5">
 <nav aria-label="Breadcrumb" className="admin-breadcrumb"><Link to="/godfather/properties">Properties</Link><span>/</span><strong>{saved?.name||'New property'}</strong><span>/</span>{tabs.find(t=>t[0]===initialTab)?.[1]}</nav>
 <header className="admin-property-header"><div><h1>{saved?.name||'Add property'}</h1><p className="subtitle">{saved?.address||'Create the property first, then complete its workspace.'}</p></div><Link className="secondary" to="/godfather/properties">Back to Properties</Link></header>
 <AdminNavigation/>
 <nav aria-label="Property workspace" className="admin-property-tabs">{tabs.map(([key,label])=><button type="button" key={key} disabled={!saved&&key!=='details'} aria-current={initialTab===key?'page':undefined} onClick={()=>changeTab(key)}>{label}</button>)}</nav>
 {initialTab==='overview'&&saved&&<><AdminSection property={saved.id} id="readiness" title="Property readiness" description="Configuration, owner approval and delivery are separate states." summary={property?.attention?'Needs setup':'Current setup'}><div className="admin-readiness-grid"><article><strong>Inventory</strong><span>{aiosellUnits.isPending?'Loading...':aiosellUnits.error?'Unavailable':activeUnits.filter(u=>u.unit_type==='ROOM').length+' private rooms / '+activeUnits.filter(u=>u.unit_type==='BED').length+' beds'}</span></article><article><strong>Billing</strong><span>{property?.billingReady===undefined?'Status unavailable':property.billingReady?'Configured':'Setup required'}</span></article><article><strong>Aiosell</strong><span>{property?.aiosellState||'Status unavailable'}</span></article></div><div className="flex flex-wrap gap-2 mt-4">{[['details','Property details'],['rooms','Rooms & beds'],['pricing','Set prices'],['users','Team access'],['billing','Billing setup'],['aiosell','Aiosell setup']].map(([key,label])=><button key={key} className="secondary" onClick={()=>changeTab(key)}>{label}</button>)}</div><div className="flex flex-wrap gap-2 mt-3"><Link className="secondary" to="/">Open assigned property workspace</Link><a className="secondary" href={'/guest-check-in?property='+saved.id} target="_blank" rel="noreferrer">Guest check-in page</a></div><p className="muted">Workspace navigation uses your own assigned access; it does not impersonate the owner.</p><p className="muted">A saved hotel ID does not mean online sales are active. Owner approval and successful delivery are still required.</p></AdminSection><AdminActivity property={saved}/></>}
 <div hidden={initialTab!=='details'}>{visited.has('details')&&<>
 <form onSubmit={save} onChangeCapture={()=>dirty('details',true)} className="admin-property-form"><fieldset disabled={busy} className="space-y-4"><AdminSection property={form.id} id="identity" title="Property identity & contact" description="The name and contact used by owner and guest views." summary={form.name||'Not completed'}><div className="billing-profile-grid">{field('name','Property name',{required:true,minLength:2,maxLength:100})}{field('tagline','Property tagline / type',{maxLength:120,placeholder:'e.g. Backpackers Hostel'})}{field('phone','Contact phone',{maxLength:25})}{field('owner_email',saved?'Add owner email (optional)':'Owner account email',{type:'email',required:!saved})}</div></AdminSection><AdminSection property={form.id} id="region" title="Address & regional settings" description="Keep the property location and reporting timezone accurate." summary={form.timezone}><div className="billing-profile-grid">{field('address','Property address',{required:true,maxLength:500})}<label>Currency<input readOnly value="INR"/></label>{field('timezone','Timezone',{required:true})}</div></AdminSection><AdminSection property={form.id} id="social" title="Guest contact & social links" description="Optional links shown on guest check-in pages."><div className="billing-profile-grid">{field('instagram_url','Instagram handle or profile URL (optional)',{maxLength:2048,placeholder:'@yourproperty'})}{field('whatsapp_number','WhatsApp with country code (optional)',{type:'tel',maxLength:25,placeholder:'+919876543210'})}{field('facebook_url','Facebook page (optional)',{type:'url',maxLength:2048,placeholder:'https://www.facebook.com/yourpage'})}</div><p className="muted">Leave social fields empty to hide them. The property name, tagline and logo appear throughout the workspace and guest check-in.</p>
 </AdminSection><AdminSection property={form.id} id="times" title="Check-in & check-out times" description="Used for arrivals, departures and overdue review." summary={(form.check_in_time||'14:00')+' / '+(form.check_out_time||'11:00')}><div className="billing-profile-grid">{field('check_in_time','Check-in time',{type:'time',required:true})}{field('check_out_time','Check-out time',{type:'time',required:true})}</div></AdminSection><AdminSection property={form.id} id="logo" title="Property logo" description="Branding for the property workspace and invoices." summary={logo?'Logo selected':'No logo'}><label>Property logo<input key={saved?.logo_path||'new'} type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>setFile(event.target.files?.[0]||null)}/><small>PNG, JPEG or WebP, up to 2 MB.</small></label><div className="flex items-center gap-4 rounded-xl border p-4">{logo?<img src={logo} alt="Property logo preview" className="h-20 w-32 object-contain"/>:<span className="muted">No logo uploaded yet</span>}<p className="muted">This logo appears on invoice headers. Issued invoices keep the logo and details approved when they were issued.</p></div>
 </AdminSection><p className="muted">The owner must already have a Supabase account. Each person uses their own login. Property and billing changes remain platform-admin only.</p>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}<button className="primary">{busy?'Saving...':saved?'Save property and logo':'Create property and continue'}</button></fieldset></form>
 </>}</div>
 {saved&&<>
 <div hidden={initialTab!=='rooms'}>{visited.has('rooms')&&<AdminSection property={saved.id} id="inventory" title="Stayman rooms & beds" description="Physical bookable units originate in Stayman." summary={activeUnits.length+' active units'}><p className="muted">Online room matches are managed in the Aiosell tab.</p><button type="button" className="secondary" onClick={()=>changeTab('aiosell')}>Open Aiosell mappings</button><RoomInventory property={saved} onDirtyChange={sectionDirty('rooms')}/></AdminSection>}</div>
 <div hidden={initialTab!=='pricing'}>{visited.has('pricing')&&(inventoryProblem||<AdminPricing property={saved} units={aiosellUnits.data?.units||[]} refresh={aiosellUnits.refetch} onDirtyChange={sectionDirty('pricing')}/>)}</div>
 <div hidden={initialTab!=='users'}>{visited.has('users')&&<AdminUsers property={saved} properties={[saved]} onChanged={onSaved}/>}</div>
 <div hidden={initialTab!=='billing'}>{visited.has('billing')&&<><AdminSection property={saved.id} id="billing" title="Legal details, tax & invoice numbering" description="Issued invoices retain their original saved details." summary={property?.billingReady?'Configured':'Check setup'}><AdminBillingProfile property={saved} onDirtyChange={sectionDirty('billing')}/></AdminSection><AdminIssuedInvoices property={saved}/></>}</div>
 <div hidden={initialTab!=='aiosell'}>{visited.has('aiosell')&&<>{inventoryProblem||<AiosellAdminSetup key={saved.id} property={saved} units={unitModels} onDirtyChange={sectionDirty('aiosell')}/>}<AdminSection property={saved.id} id="owner-preview" title="Preview owner page" description="Read-only view of the same saved configuration; no impersonation or access changes." defaultOpen={false}><AiosellOwnerPanel property={saved} readOnly pricingHref={'/godfather/properties/'+saved.id+'/pricing'}/></AdminSection></>}</div>
 <div hidden={initialTab!=='activity'}>{visited.has('activity')&&<AdminActivity property={saved}/>}</div>
 </>}
 </main>;
}
