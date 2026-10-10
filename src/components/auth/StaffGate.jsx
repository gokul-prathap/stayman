import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { databaseError, staffProperties } from '../../services/stayman';
import LoginPage from './LoginPage';
const StaffContext = createContext(null);
export const useStaff = () => useContext(StaffContext);
export default function StaffGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [properties, setProperties] = useState(null);
  const [propertyId, setPropertyId] = useState('');
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
    let active = true; setProperties(null); setError('');
    if (session && !session.user.is_anonymous) {
      staffProperties().then(items => { if (active) { setProperties(items); setPropertyId(items[0]?.id || ''); } })
        .catch(err => { if (active) { setError(databaseError(err)); setProperties([]); } });
    }
    return () => { active = false; };
  }, [session?.user.id]);
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
  if (session === undefined || (session && !session.user.is_anonymous && properties === null)) return <p className="p-8">Loading staff access…</p>;
  if (!session || session.user.is_anonymous) return <LoginPage onSubmit={login} busy={busy} error={error}/>;
  if (!properties.length) return <main className="mx-auto max-w-lg space-y-4 p-8"><h1 className="text-xl font-bold">Staff access needs setup</h1><p>{error || 'Your account is not assigned to a property. Follow docs/reservations-setup.md to add your staff membership.'}</p><button onClick={signOut} className="rounded-lg border p-3">Sign out</button></main>;
  return <StaffContext.Provider value={{ property: properties.find(p => p.id === propertyId), properties, setPropertyId, signOut, reloadProperties }}>{children}</StaffContext.Provider>;
}
