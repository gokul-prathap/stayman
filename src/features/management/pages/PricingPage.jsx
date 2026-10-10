import React, { useEffect, useState } from 'react';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { useStaff } from '../../../components/auth/StaffGate';
import { saveRates, databaseError } from '../../../services/stayman';
import { roomGroups, rupeesToPaise } from '../utils/metrics';
import PageState from '../components/PageState';
import '../management.css';
export default function PricingPage() {
  const { property } = useStaff();
  const { data, isPending, error, refresh } = usePropertyData();
  const [values, setValues] = useState({});
  const [bulk, setBulk] = useState({ BED: '', ROOM: '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [saveError, setSaveError] = useState('');
  const groups = roomGroups(data?.units || []);
  useEffect(() => {
    const initial = {};
    roomGroups(data?.units || []).forEach(g => { initial[g.key] = g.units.every(u => u.nightlyRatePaise === g.units[0].nightlyRatePaise) ? String(g.units[0].nightlyRatePaise / 100) : ''; });
    setValues(initial);
  }, [data?.units, property.id]);
  const apply = type => {
    try { rupeesToPaise(bulk[type]); setValues(v => ({ ...v, ...Object.fromEntries(groups.filter(g => g.type === type).map(g => [g.key,bulk[type]])) })); setSaveError(''); setMessage('Rates filled in. Save all changes to apply.'); }
    catch(err) { setSaveError(err.message); }
  };
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setSaveError('');
    try {
      const rates = groups.flatMap(g => g.units.map(u => ({ unitId: u.id, ratePaise: rupeesToPaise(values[g.key]) })));
      await saveRates(property.id, rates); await refresh(); setMessage('All room rates saved. Existing reservation totals are unchanged.');
    } catch(err) { setSaveError(databaseError(err)); } finally { setBusy(false); }
  }
  return <section className="management space-y-5"><h1>Pricing</h1><p className="subtitle">Set nightly rates for every dorm and private room at {property.name}.</p>
    <PageState pending={isPending} error={error} retry={refresh} />
    {data && !error && <form onSubmit={save}><fieldset disabled={busy || !data.isOwner} className="space-y-5">
      {!data.isOwner && <p className="notice">Only a property owner can change pricing.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{[['BED','All dorm beds'],['ROOM','All private rooms']].map(([type,label]) => <div key={type} className="card"><h2>{label}</h2><p className="muted mt-1">{type === 'BED' ? 'Price per bed, per night' : 'Price per room, per night'}</p><div className="mt-4 flex items-end gap-3"><label className="flex-1">Nightly rate (INR)<input type="number" min="0" max="1000000" step="0.01" value={bulk[type]} onChange={e => setBulk(v => ({...v,[type]:e.target.value}))}/></label><button type="button" onClick={() => apply(type)} className="secondary">Apply to all</button></div></div>)}</div>
      <div className="card"><h2>Room rates</h2><p className="muted mt-1">Bulk changes can be adjusted below before saving. Zero means no configured charge.</p><div className="mt-5 space-y-4">{groups.map(g => <div key={g.key} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7edf5] pb-4"><div><p className="text-sm font-semibold">{g.name}</p><p className="muted mt-1">{g.type === 'BED' ? g.units.length + ' beds · per bed / night' : g.units.length + ' rooms · per room / night'}</p></div><label className="w-40">Rate (INR)<input aria-label={'Nightly rate for ' + g.name} type="number" required min="0" max="1000000" step="0.01" placeholder="Mixed rates" value={values[g.key] ?? ''} onChange={e => { setValues(v => ({...v,[g.key]:e.target.value})); setMessage(''); }}/></label></div>)}{!groups.length && <p className="notice">Add beds and rooms in Supabase before setting rates.</p>}</div></div>
      {saveError && <p role="alert" className="error">{saveError}</p>}{message && <p role="status" className="success">{message}</p>}
      <div className="flex justify-end"><button className="primary" disabled={busy || !groups.length}>{busy ? 'Saving...' : 'Save all changes'}</button></div>
    </fieldset></form>}
  </section>;
}
