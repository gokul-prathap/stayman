import AppLoader from '../ui/AppLoader';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { databaseError, staffProperties } from '../../services/stayman';
import LoginPage from './LoginPage';
import {Link,Navigate} from 'react-router-dom';
import {adminRpc} from '../../services/platformAdmin';
const StaffContext = createContext(null);
export const useStaff = () => useContext(StaffContext);
export default function StaffGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [properties, setProperties] = useState(null);
  const [propertyId, setPropertyId] = useState('');
  const [isPlatformAdmin,setIsPlatformAdmin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) { setSession(null); setError('Configure Supabase in .env.local.'); return; }
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => { if (active) { setSession(data.session); if (error) setError(error.message); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true; setProperties(null); setError(''); setIsPlatformAdmin(false);
    if (session && !session.user.is_anonymous) {
      staffProperties().then(async items => {
        // Platform administrators do not need a property membership. The RPC
        // also checks OTP authentication; password sessions must use /godfather.
        const admin = !items.length ? await adminRpc('stayman_is_platform_admin').catch(()=>false) : false;
        if (active) { setIsPlatformAdmin(admin); setProperties(items); setPropertyId(items[0]?.id || ''); }
      })
        .catch(err => { if (active) { setError(databaseError(err)); setProperties([]); } });
    }
    return () => { active = false; };
  }, [session?.access_token]);
  useEffect(()=>{
    if(!session||session.user.is_anonymous)return;
    let active=true;
    const sync=()=>staffProperties().then(items=>{if(active){setProperties(items);setPropertyId(current=>items.some(p=>p.id===current)?current:items[0]?.id||'');}}).catch(()=>{/* Keep the last loaded profile while offline. */});
    window.addEventListener('focus',sync);
    return()=>{active=false;window.removeEventListener('focus',sync);};
  },[session?.user?.id]);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    try {
      if (!supabase) throw new Error('Configure Supabase in .env.local.');
      const { error } = await supabase.auth.signInWithPassword({ email: values.get('email'), password: values.get('password') });
      if (error) throw error;
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const reloadProperties = async () => {
    const items = await staffProperties(); setProperties(items);
    setPropertyId(current => items.some(p => p.id === current) ? current : items[0]?.id || '');
  };
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) setError(error.message); };
  if (session === undefined || (session && !session.user.is_anonymous && properties === null)) return <AppLoader label="Opening your workspace" fullPage/>;
  if (!session || session.user.is_anonymous) return <LoginPage onSubmit={login} busy={busy} error={error}/>;
  if (!properties.length && isPlatformAdmin) return <Navigate to="/godfather" replace/>;
  if (!properties.length) return <main className="mx-auto max-w-lg space-y-4 p-8"><h1 className="text-xl font-bold">Choose your workspace</h1><p>{error || 'This account has no property assignment. Property staff should contact their property owner for access.'}</p><p>Platform administrators can sign in with an email code below. A property assignment is not required.</p><div className="flex flex-wrap gap-3"><Link to="/godfather" className="rounded-lg bg-brand-600 text-white p-3">Platform admin login</Link><button onClick={signOut} className="rounded-lg border p-3">Sign out</button></div></main>;
  return <StaffContext.Provider value={{ property: properties.find(p => p.id === propertyId), properties, setPropertyId, signOut, reloadProperties }}>{children}</StaffContext.Provider>;
}
