import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {KeyRound,ArrowRight,CheckCircle2} from 'lucide-react';
import {supabase} from '../../services/supabase';
import '../../features/management/management.css';
import '../../features/admin/admin.css';

export default function PasswordSetupPage(){
 const location=useLocation(),requestMode=location.pathname==='/auth/reset-password';
 const [email,setEmail]=useState(''),[session,setSession]=useState(null),[loading,setLoading]=useState(!requestMode),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 const verification=useRef(null);
 useEffect(()=>{
  if(requestMode)return;let active=true;
  if(!verification.current)verification.current=(async()=>{
   if(!supabase)throw new Error('Supabase is not configured.');
   const params=new URLSearchParams(window.location.search),hash=new URLSearchParams(window.location.hash.slice(1));
   if(params.get('error_description')||hash.get('error_description'))throw new Error('This link has expired or is invalid. Request a fresh password link.');
   if(params.get('token_hash')){
    const type=params.get('type');if(!['invite','recovery'].includes(type))throw new Error('Unsupported password link.');
    const {error}=await supabase.auth.verifyOtp({token_hash:params.get('token_hash'),type});if(error)throw error;
    window.history.replaceState(null,'',window.location.pathname);
   }
   const {data,error}=await supabase.auth.getSession();if(error)throw error;
   if(!data.session||data.session.user.is_anonymous)throw new Error('Open the invitation email to choose your password, or request a fresh link below.');
   return data.session;
  })();
  verification.current.then(value=>{if(active)setSession(value);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[requestMode]);
 async function submit(event){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(!supabase)throw new Error('Supabase is not configured.');
   if(requestMode){const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:window.location.origin+'/auth/set-password'});if(error)throw error;setMessage('If this email has an account, a password link is on its way. Check your inbox and spam folder.');}
   else{
    if(password.length<12)throw new Error('Use at least 12 characters.');if(password!==confirmation)throw new Error('The passwords do not match.');
    const {error}=await supabase.auth.updateUser({password});if(error)throw error;
    const {error:acceptError}=await supabase.rpc('stayman_accept_staff_invitations');
    setPassword('');setConfirmation('');setDone(true);
    if(acceptError)setMessage('Your password is saved. Invitation history could not refresh, but you can continue to your workspace.');
   }
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <main className="admin-auth-page management"><section className="admin-auth-card"><Link to="/" className="admin-wordmark">Stayman<span>PROPERTY WORKSPACE</span></Link><div className="admin-auth-symbol">{done?<CheckCircle2 size={28}/>:<KeyRound size={28}/>}</div><p className="admin-eyebrow">{requestMode?'WELCOME BACK':'YOUR WORKSPACE IS WAITING'}</p><h1>{done?'You’re ready to go.':requestMode?'Forgot your password?':'Make yourself at home.'}</h1><p className="muted">{done?'Your password has been saved.':requestMode?'We’ll email you a secure link to choose a new password.':session?'Choose a password for '+session.user.email+'.':'Open your invitation link to finish setting up your account.'}</p>
 {loading&&<p role="status">Checking your invitation…</p>}{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 {done?<Link className="primary admin-send" to="/">Open property workspace <ArrowRight size={17}/></Link>:(requestMode||session)&&<form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">{requestMode?<label>Email address<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label>:<><label>New password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)}/></label><small className="muted">Use at least 12 characters. A few memorable words work well.</small><label>Confirm password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label></>}<button className="primary admin-send w-full">{busy?'Please wait…':requestMode?'Send password link':'Save password and continue'}<ArrowRight size={17}/></button></fieldset></form>}
 {!done&&<div className="admin-auth-links"><Link to="/">Back to sign in</Link>{!requestMode&&<Link to="/auth/reset-password">Request a fresh link</Link>}</div>}
 </section></main>;
}
