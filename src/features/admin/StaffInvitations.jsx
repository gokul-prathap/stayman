import AppLoader from '../../components/ui/AppLoader';
import {useState,useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {MailPlus,Send,RefreshCw,ShieldCheck} from 'lucide-react';
import {supabase} from '../../services/supabase';

export default function StaffInvitations({properties,onChanged,propertyId='',onDirtyChange}){
 const [form,setForm]=useState({property:propertyId,email:'',role:'MANAGER'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{onDirtyChange?.(!!form.email.trim());return()=>onDirtyChange?.(false);},[form.email,onDirtyChange]);
 const query=useQuery({queryKey:['staff-invitations',propertyId||'all'],queryFn:async()=>{let request=supabase.from('stayman_staff_invitations').select('id,property_id,email,role,status,sent_at,accepted_at');if(propertyId)request=request.eq('property_id',propertyId);const {data,error}=await request.order('sent_at',{ascending:false}).limit(50);if(error)throw error;return data;},refetchInterval:30000});
 async function invite(values){
  setBusy(true);setError('');setMessage('');
  try{
   const {data,error}=await supabase.functions.invoke('invite-staff',{body:values});
   if(error){let detail='Unable to reach the invitation service. Deploy invite-staff and configure its allowed app URLs.';try{detail=(await error.context.json()).error||detail;}catch{/* no JSON response */}throw new Error(detail);}
   if(data?.error)throw new Error(data.error);
   setMessage(data.message);setForm(value=>({...value,email:''}));await Promise.all([query.refetch(),onChanged()]);
  }catch(err){setError(err.message);await query.refetch();}finally{setBusy(false);}
 }
 return <section className="card admin-invitations" id="team-invitations"><div className="admin-section-heading"><div className="admin-section-icon"><MailPlus size={22}/></div><div><h2>Invite your property team</h2><p className="muted">One person, one login. Send a secure link to get them started.</p></div></div>
 <form onSubmit={event=>{event.preventDefault();invite(form);}}><fieldset disabled={busy||!properties.length} className="admin-invite-form"><label>Property<select required value={form.property} onChange={event=>setForm({...form,property:event.target.value})}><option value="">Choose a property</option>{properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label>Team member email<input required type="email" maxLength={254} autoComplete="email" placeholder="manager@property.com" value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label><label>Access level<select value={form.role} onChange={event=>setForm({...form,role:event.target.value})}><option value="MANAGER">Manager / reception</option><option value="OWNER">Property owner</option></select></label><button className="primary admin-send" disabled={busy}><Send size={16}/>{busy?'Sending…':'Send invitation'}</button></fieldset></form>
 {!properties.length&&<p className="notice">Add a property before inviting its team.</p>}
 <p className="admin-access-note"><ShieldCheck size={16}/>Property access only. Property profile and billing configuration stay admin-only. Existing owners retain their owner role.</p>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 <div className="admin-section-heading admin-invite-history"><div><h3>Recent invitations</h3><p className="muted">Sent means handed to the email service; accepted means password setup was completed.</p></div><button type="button" className="secondary" onClick={()=>query.refetch()} aria-label="Refresh invitations"><RefreshCw size={16}/></button></div>
 {query.isPending?<AppLoader label="Loading invitations…"/>:query.error?<p className="notice">Apply migration 020 to enable invitation history.</p>:<div className="overflow-x-auto"><table><thead><tr><th>Team member</th><th>Property</th><th>Role</th><th>Status</th><th>Last attempt</th><th/></tr></thead><tbody>{query.data.map(row=><tr key={row.id}><td>{row.email}</td><td>{properties.find(p=>p.id===row.property_id)?.name||'Property'}</td><td>{row.role==='OWNER'?'Owner':'Manager'}</td><td><span className={'admin-invite-status '+row.status.toLowerCase()}>{({SENDING:'Sending',SENT:'Email sent',FAILED:'Needs retry',ACCEPTED:'Accepted'})[row.status]}</span></td><td>{new Date(row.sent_at).toLocaleString()}</td><td><button className="secondary" disabled={busy||Date.now()-new Date(row.sent_at).getTime()<60000} onClick={()=>invite({property:row.property_id,email:row.email,role:row.role})}>Resend link</button></td></tr>)}{!query.data.length&&<tr><td colSpan={6} className="admin-empty">Your team starts here. Send the first invitation above.</td></tr>}</tbody></table></div>}
 </section>;
}
