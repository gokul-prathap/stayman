import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '../../services/supabase';
import './admin.css';

export default function AdminOtpLogin() {
 const [password,setPassword]=useState(''),[passwordMode,setPasswordMode]=useState(import.meta.env.DEV);
 const [email,setEmail]=useState(''),[sentEmail,setSentEmail]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
 const remaining=Math.max(0,Math.ceil((retryAt-now)/1000));
 async function passwordLogin(event){
  event.preventDefault();setBusy(true);setError('');
  try {if(!supabase)throw new Error('Supabase is not configured.');const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(error)throw error;}catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function send(event){
  event.preventDefault();if(busy||remaining)return;setBusy(true);setError('');setMessage('');
  const address=(sentEmail||email).trim().toLowerCase();
  try {
   if(!supabase)throw new Error('Supabase is not configured.');
   const {error}=await supabase.auth.signInWithOtp({email:address,options:{shouldCreateUser:false}});
   if(error)throw error;
   setSentEmail(address);setCode('');setRetryAt(Date.now()+60000);setNow(Date.now());
   setMessage('If this email has an account, a login code has been sent. Check your inbox and spam folder.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 async function verify(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try {const {error}=await supabase.auth.verifyOtp({email:sentEmail,token:code.trim(),type:'email'});if(error)throw error;}
  catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <main className="management admin-auth-page"><section className="admin-auth-card space-y-5" aria-label="Administrator email login"><div><p className="muted">STAYMAN ADMIN</p><h1>Sign in with email</h1><p className="subtitle">{passwordMode&&import.meta.env.DEV?'Use your administrator email and password for development.':'Use your registered administrator email. No password required.'}</p></div>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 {import.meta.env.DEV&&<button type="button" className="secondary" onClick={()=>{setPasswordMode(value=>!value);setError('');}}>{passwordMode?'Use email OTP':'Development password login'}</button>}
 {import.meta.env.DEV&&passwordMode?<form onSubmit={passwordLogin} className="space-y-4"><p className="notice">Development login. A temporary server permission and an existing admin password are required.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="primary w-full" disabled={busy}>{busy?'Signing in...':'Sign in'}</button></form>:!sentEmail?<form onSubmit={send} className="space-y-4"><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label><button className="primary w-full" disabled={busy||remaining>0}>{busy?'Sending...':remaining?'Send code in '+remaining+'s':'Send login code'}</button></form>:<><form onSubmit={verify} className="space-y-4"><p className="muted">Code requested for {sentEmail}</p><label>Login code<input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} disabled={busy}/></label><button className="primary w-full" disabled={busy}>{busy?'Verifying...':'Verify and sign in'}</button></form><div className="flex flex-wrap gap-3"><button className="secondary" disabled={busy||remaining>0} onClick={send}>{remaining?'Resend in '+remaining+'s':'Resend code'}</button><button className="secondary" disabled={busy} onClick={()=>{setSentEmail('');setCode('');setMessage('');setError('');}}>Change email</button></div></>}
 <Link className="secondary inline-block" to="/">Staff password login</Link>
 </section></main>;
}
