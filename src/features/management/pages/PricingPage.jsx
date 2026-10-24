import AiosellPlanPrices from '../components/AiosellPlanPrices';
import React, { useEffect, useState } from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { useStaff } from '../../../components/auth/StaffGate';
import { db, saveRates, databaseError } from '../../../services/stayman';
import {syncSavedPricing} from '../../../services/aiosellPricing';
import {useVisiblePolling} from '../../reservations/hooks/useVisiblePolling';
import { roomGroups, rupeesToPaise } from '../utils/metrics';
import PageState from '../components/PageState';
import PricingConfirmation from '../components/PricingConfirmation';
import '../management.css';
export default function PricingPage() {
  const { property } = useStaff();
  const { data, isPending, error, refresh } = usePropertyData({mode:'inventory'});
  const [values, setValues] = useState({});
  const [pricingView, setPricingView] = useState('grouped');
  const [bulk, setBulk] = useState({ BED: '', ROOM: '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [saveError, setSaveError] = useState('');
  const [syncing, setSyncing] = useState(false), [syncFeedback, setSyncFeedback] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const groups = roomGroups(data?.units || []);
  const statusInterval = useVisiblePolling(60000);
  const channel = useQuery({queryKey: ['aiosell-pricing', property.id], enabled: !!data?.isOwner, retry: false, staleTime: 15000,
    refetchInterval: query => statusInterval && ['pending','failed'].includes(query.state.data?.status) ? statusInterval : false,
    queryFn: async () => {
      const {data, error} = await db().rpc('stayman_aiosell_pricing_status', {p_property: property.id});
      if (error) throw error;
      return data;
    }});
  useEffect(() => {
    const initial = {};
    (data?.units || []).forEach(unit => { initial[unit.id] = String(unit.nightlyRatePaise / 100); });
    setValues(initial);
  }, [data?.units, property.id]);
  useEffect(() => {setPendingSave(null);}, [property.id]);
  const apply = type => {
    try { rupeesToPaise(bulk[type]); setValues(v => ({ ...v, ...Object.fromEntries((data?.units || []).filter(unit => unit.type === type).map(unit => [unit.id,bulk[type]])) })); setSaveError(''); setMessage('Rates filled in. Save all changes to apply.'); }
    catch(err) { setSaveError(err.message); }
  };
  function reviewSave(event) {
    event.preventDefault();
    if (busy || !data?.isOwner) return;
    setSaveError('');
    try {
      const rates = (data?.units || []).map(unit => ({unitId: unit.id, ratePaise: rupeesToPaise(values[unit.id])}));
      const changes = rates.flatMap((rate, index) => {
        const unit = data.units[index];
        return rate.ratePaise === unit.nightlyRatePaise ? [] : [{unitId: unit.id, name: `${unit.roomName} / ${unit.label}`, before: unit.nightlyRatePaise, after: rate.ratePaise}];
      });
      setPendingSave({propertyId: property.id, rates, changes});
    } catch (err) {setSaveError(databaseError(err));}
  }
  async function save() {
    if (busy || !pendingSave || pendingSave.propertyId !== property.id || !data?.isOwner) return;
    const {rates} = pendingSave;
    setPendingSave(null); setBusy(true); setMessage(''); setSaveError(''); setSyncFeedback(null);
    try {
      await saveRates(property.id, rates);
      setMessage('Prices saved. Existing reservation totals are unchanged.');
      // Read fresh configuration rather than relying on a possibly stale enabled flag.
      const current = await channel.refetch();
      if (current.data?.enabled) {
        setSyncing(true);
        setSyncFeedback(await syncSavedPricing(db(), property.id));
      } else if (current.error) {
        setSyncFeedback({state:'pending', message:'Rate sync status unavailable. Prices are saved; background sync will retry if enabled.'});
      }
      await refresh();
    } catch(err) { setSaveError(databaseError(err)); } finally { setBusy(false); setSyncing(false); }
  }
  return <section className="management space-y-5"><h1>Pricing</h1><p className="subtitle">Set nightly rates for every dorm and private room at {property.name}.</p>
    {pendingSave && <PricingConfirmation changes={pendingSave.changes} onCancel={() => setPendingSave(null)} onConfirm={save} />}
    <PageState hasData={!!data} pending={isPending} error={error} retry={refresh} />
    {data?.isOwner && <div className="card space-y-2"><h2>Aiosell rate sync</h2>
      {channel.isPending ? <p>Loading rate sync status...</p> : channel.error ? <p role="alert">Rate sync status unavailable. Apply migration 029 if setup is missing. Local pricing can still be saved.</p> : <>
        <p><strong>{({not_configured:'Not configured',paused:'Paused',pending:'Pending',sent:'Sent',failed:'Failed'})[channel.data?.status]}</strong>{channel.data?.message ? `: ${channel.data.message}` : ''}</p>
        {channel.data?.mappings?.map(mapping => <p key={mapping.key}>{mapping.name}: {mapping.priceIssue || `INR ${(mapping.price / 100).toFixed(2)} per unit / night`}</p>)}
        <p className="muted">Saving prices immediately attempts Aiosell sync when the connection is enabled. The background scheduler handles retries and other inventory changes. Restrictions have a separate status.</p>
      </>}
      <div className="flex flex-wrap gap-3"><Link to="/settings" className="secondary">Open Aiosell in Settings</Link><button type="button" className="secondary" disabled={channel.isFetching} onClick={() => channel.refetch()}>Refresh rate sync status</button></div>
    </div>}
    {data?.isOwner && <AiosellPlanPrices propertyId={property.id} channel={channel}/>}
    {data && <form onSubmit={reviewSave}><fieldset disabled={busy || !!pendingSave || !data.isOwner} className="space-y-5">
      {!data.isOwner && <p className="notice">Only a property owner can change pricing.</p>}
      <div className="grid gap-4 sm:grid-cols-2">{[['BED','All dorm beds'],['ROOM','All private rooms']].map(([type,label]) => <div key={type} className="card"><h2>{label}</h2><p className="muted mt-1">{type === 'BED' ? 'Price per bed, per night' : 'Price per room, per night'}</p><div className="mt-4 flex items-end gap-3"><label className="flex-1">Nightly rate (INR)<input type="number" min="0" max="1000000" step="0.01" value={bulk[type]} onChange={e => setBulk(v => ({...v,[type]:e.target.value}))}/></label><button type="button" onClick={() => apply(type)} className="secondary">Apply to all</button></div></div>)}</div>
      <div className="card space-y-4"><h2>Room rates</h2>
        <label>Pricing view<select aria-label="Pricing view" value={pricingView} onChange={e => setPricingView(e.target.value)}>
          <option value="grouped">By room category</option><option value="individual">Individual rooms and beds</option>
        </select></label>
        <p className="muted">Bulk changes can be adjusted below before saving. Switching views preserves your edits. Zero means no configured charge.</p>
        {pricingView === 'individual' ? <div className="space-y-4">{(data.units || []).map(unit => <div key={unit.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7edf5] pb-4">
          <div><p className="text-sm font-semibold">{unit.roomName} / {unit.label}</p><p className="muted">{unit.type === 'BED' ? 'Per bed / night' : 'Per room / night'}</p></div>
          <label className="w-40">Rate (INR)<input aria-label={'Nightly rate for ' + unit.roomName + ' / ' + unit.label} type="number" required min="0" max="1000000" step="0.01" value={values[unit.id] ?? ''} onChange={e => {setValues(v => ({...v,[unit.id]:e.target.value}));setMessage('');}} /></label>
        </div>)}</div> : <div className="space-y-4">{groups.map(group => {
          const rates = group.units.map(unit => values[unit.id] ?? '');
          const uniform = rates.every(rate => rate === rates[0]);
          return <div key={group.key} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e7edf5] pb-4">
            <div><p className="text-sm font-semibold">{group.name}</p><p className="muted">{group.units.length} {group.type === 'BED' ? 'beds - per bed / night' : 'rooms - per room / night'}</p>
              {!uniform && <><p className="muted">Individual prices are preserved unless you enter a category price.</p><button type="button" className="secondary" onClick={() => setPricingView('individual')}>Edit individual rates for {group.name}</button></>}
            </div>
            <label className="w-40">Rate (INR)<input aria-label={'Nightly rate for ' + group.name} type="number" min="0" max="1000000" step="0.01" placeholder="Mixed rates" value={uniform ? rates[0] : ''} onChange={e => {const value=e.target.value;setValues(v => ({...v,...Object.fromEntries(group.units.map(unit => [unit.id,value]))}));setMessage('');}} /></label>
          </div>;
        })}</div>}
        {!groups.length && <p className="notice">Add rooms and beds before setting rates.</p>}
        <p className="muted">Each Aiosell category has one inventory mapping. Map individually priced beds/rooms separately. Optional rate-plan prices above can differ while sharing the same availability.</p>
      </div>
      {saveError && <p role="alert" className="error">{saveError}</p>}{message && <p role="status" className="success">{message}</p>}
      {syncFeedback && <p role={syncFeedback.state === 'failed' ? 'alert' : 'status'} className={syncFeedback.state === 'failed' ? 'notice' : 'success'}>{syncFeedback.message}</p>}
      <div className="flex justify-end"><button className="primary" disabled={busy || !groups.length}>{syncing ? 'Prices saved - syncing Aiosell...' : busy ? 'Saving...' : 'Save all changes'}</button></div>
    </fieldset></form>}
  </section>;
}
