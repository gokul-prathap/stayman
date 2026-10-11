import NightScene from '../illustrations/NightScene';
import React, {useState} from 'react';
import { ArrowRight, Eye, EyeOff, House, LockKeyhole, Mail } from 'lucide-react';
import './login.css';
export default function LoginPage({onSubmit,busy,error}) {
 const [visible,setVisible]=useState(false);
 return <main className="stayman-login"><div className="login-shell">
 <section className="login-scene" aria-label="Moonlit mountains illustration">
 <div className="login-brand"><House size={26} className="login-brand-icon" aria-hidden="true"/><span>Stayman</span></div><NightScene className="login-illustration"/>
 <div className="scene-caption"><span>LESS ADMIN. MORE HOSPITALITY.</span><h2>A calmer way<br/>to run your stay.</h2><p>Your property, people and bookings.<br/>All in one place.</p></div></section>
 <section className="login-panel"><div className="login-mobile-brand"><House size={23} className="login-brand-icon" aria-hidden="true"/><span>Stayman</span></div><p className="login-eyebrow">WELCOME BACK</p><h1>Hello, again.</h1><p className="login-intro">Sign in to your Stayman workspace.</p><form onSubmit={onSubmit}>
 <label htmlFor="staff-email">Email address</label><div className="login-input"><Mail size={17}/><input id="staff-email" name="email" type="email" required autoComplete="username" placeholder="you@property.com"/></div>
 <label htmlFor="staff-password">Password</label><div className="login-input"><LockKeyhole size={17}/><input id="staff-password" name="password" type={visible?'text':'password'} required autoComplete="current-password" placeholder="Enter your password"/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?'Hide password':'Show password'}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
 {error && <p role="alert" className="login-error">{error}</p>}<button className="login-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={18}/></button></form><p className="login-footer">Secure access for your property team.</p></section>
 </div></main>;
}
