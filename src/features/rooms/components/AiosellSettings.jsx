import React, {useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router-dom';
import {RefreshCw} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {db} from '../../../services/stayman';
import {validateAiosellMappings} from '../../../services/aiosellMappings';
import CollapsibleCard from '../../../components/ui/CollapsibleCard';
import StopSellConfirmation from './StopSellConfirmation';
import './aiosell-settings.css';

const emptyMapping = () => ({roomCode: '', rateplanCode: '', unitIds: [], minimumStay: 1, stopSell: false});
async function rpc(name, args) {
  const {data, error} = await db().rpc(name, args);
  if (error) throw error;
  return data;
}
export default function AiosellSettings({property, units}) {
  const [form, setForm] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [remote, setRemote] = useState(null);
  const [channels, setChannels] = useState(null), [syncResults, setSyncResults] = useState(null);
  const [syncNotice, setSyncNotice] = useState(null);
  const [stopSellChange, setStopSellChange] = useState(null);
  const query = useQuery({queryKey: ['aiosell-settings', property.id], queryFn: () => rpc('stayman_aiosell_settings', {p_property: property.id}), staleTime: 30000, retry: false});
  const connection = query.data?.connection;
  const savedMappings = connection?.mappings || [];
  const allStopSold = savedMappings.length > 0 && savedMappings.every(mapping => mapping.stopSell === true);
  const inventoryAcknowledged = connection?.revision != null && connection?.last_sync_results?.revision === connection.revision && connection?.last_sync_results?.stages?.inventory?.status === 'sent';
  const canPause = allStopSold && (inventoryAcknowledged || connection?.revision != null && connection?.synced_revision === connection.revision && !connection?.last_error);
  const current = form || {hotel: connection?.hotel_code || 'sandbox-pms', enabled: connection?.enabled || false, mappings: connection?.mappings || []};
  const inventoryResult = (syncResults || connection?.last_sync_results?.stages)?.inventory;
  const traceRows = inventoryResult?.verification?.rows || inventoryResult?.details?.rows || [];
  const edit = changes => setForm({...current, ...changes});
  const editMapping = (index, changes) => edit({mappings: current.mappings.map((m, i) => i === index ? {...m, ...changes} : m)});
  async function run(action) {
    setBusy(true); setError(''); setMessage('');
    let latestResults = null;
    if (action === 'sync') setSyncNotice(null);
    try {
      if (action === 'save') {
        const mappings = validateAiosellMappings(current.mappings);
        await rpc('stayman_aiosell_save', {p_property: property.id, p_hotel: current.hotel.trim(), p_enabled: current.enabled, p_mappings: mappings});
        setForm(null); await query.refetch(); setMessage('Connection saved.');
      } else {
        const {data, error: invocationError} = await db().functions.invoke('aiosell-sync', {body: {property: property.id, action}});
        if (invocationError) {
          let detail;
          try { detail = await invocationError.context?.json(); } catch { /* Use safe SDK message. */ }
          if (detail?.results) { latestResults = detail.results; setSyncResults(detail.results); }
          await query.refetch();
          throw new Error(detail?.error || invocationError.message);
        }
        if (data.results) { latestResults = data.results; setSyncResults(data.results); }
        if (data.error) throw new Error(data.error);
        if (action === 'mapping') { setRemote(data); setMessage('Property mapping fetched. Select matching codes below.'); }
        else {
          setMessage(data.message);
          setSyncNotice({title: data.status === 'complete' ? 'Sync completed' : data.status === 'partial' ? 'Sync partially completed' : 'Sync status', message: data.message, results: latestResults});
        }
        await query.refetch();
      }
    } catch (err) {
      const message = err.message || 'Aiosell request failed.';
      setError(message);
      if (action === 'sync') setSyncNotice({title: 'Sync failed', message, results: latestResults});
    } finally { setBusy(false); }
  }
  async function saveChannels() {
    setBusy(true); setError(''); setMessage('');
    try {
      await rpc('stayman_aiosell_channels', {p_property: property.id, p_channels: (channels ?? (connection?.restriction_channels || []).join(',')).split(',').map(value => value.trim()).filter(Boolean)});
      setChannels(null); await query.refetch(); setMessage('Restriction targets saved. Click Sync now to test.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function resolve(event, eventId) {
    event.preventDefault(); const reservation = new FormData(event.currentTarget).get('reservation');
    setBusy(true); setError('');
    try { await rpc('stayman_aiosell_resolve', {p_event: eventId, p_reservation: reservation}); await query.refetch(); setMessage('Event reconciled. Sync inventory to publish availability.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (query.isPending) return <p role="status">Loading Aiosell settings...</p>;
  if (query.error) return <p role="alert" className="error">{query.error.message} Apply migration 027 if Aiosell setup is missing. Owner access is required.</p>;
  return <div className="card space-y-5">
    {stopSellChange && <StopSellConfirmation roomCode={stopSellChange.roomCode} enabled={stopSellChange.enabled}
      onCancel={() => setStopSellChange(null)} onConfirm={() => {
        if (current.mappings[stopSellChange.index]?.roomCode === stopSellChange.roomCode) {
          editMapping(stopSellChange.index, {stopSell: stopSellChange.enabled});
          setMessage('Stop-sell change confirmed in draft. Save mappings, then sync to apply it in Aiosell.');
        }
        setStopSellChange(null);
      }} />}
    {syncNotice && createPortal(<aside role="status" aria-live="polite" aria-atomic="true" aria-label="Aiosell sync notification" className="fixed top-4 left-4 right-4 sm:left-auto sm:w-96 z-[100] rounded-xl border border-slate-300 bg-white text-slate-900 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4"><strong>{syncNotice.title}</strong><button type="button" aria-label="Dismiss sync notification" onClick={() => setSyncNotice(null)} className="px-2 text-lg leading-none">×</button></div>
      <p className="mt-2 text-sm">{syncNotice.message}</p>
      {syncNotice.results && <ul className="mt-3 space-y-1 text-sm">{Object.entries(syncNotice.results).map(([stage, result]) => <li key={stage}>{stage[0].toUpperCase() + stage.slice(1)}: {result.status === 'sent' ? 'Sent' : result.status === 'pending' ? 'Pending' : 'Failed'}</li>)}</ul>}
    </aside>, document.body)}
    <h2>Aiosell channel manager</h2>
    <p className="muted">Channel prices follow the Pricing page for a rolling 90-day window. Change prices once in Pricing; mapped units must have the same positive nightly rate. Existing reservation totals stay unchanged. One rate plan per room type is supported.</p>
    <p className="muted">Stop sell closes a category to new online bookings; existing bookings remain. To remove or rename saved mappings: tick Stop sell on every mapping, save, then Sync now. Verify zero availability in Aiosell, then pause the connection and save before editing.</p>
    <fieldset disabled={busy} className="space-y-4">
      <label>Hotel code<input value={current.hotel} maxLength={120} onChange={e => {edit({hotel: e.target.value}); setRemote(null);}} /></label>
      <div className="aiosell-sync-control"><button type="button" role="switch" aria-label="Enable background sync and receive bookings" aria-checked={current.enabled}
        className="aiosell-sync-switch" disabled={!!connection?.enabled && !canPause} aria-describedby={'aiosell-sync-help aiosell-save-help' + (connection?.enabled ? ' aiosell-pause-help' : '')}
        onClick={() => {if (!connection?.enabled || canPause) edit({enabled: !current.enabled});}}><span><RefreshCw size={16} aria-hidden="true" /></span></button>
        <div><strong>Background sync: {current.enabled ? 'On' : 'Off'}</strong><p className="muted">{current.enabled !== !!connection?.enabled ? 'Unsaved change - click Save connection to apply.' : connection?.enabled ? 'Connection active.' : 'Connection paused or not yet configured.'}</p></div>
      </div>
      <p id="aiosell-sync-help" className="muted">Enables scheduled inventory and rate updates, plus receiving OTA booking events through Aiosell. The background scheduler must be configured; this switch does not install it.</p>
      {connection?.enabled && <p id="aiosell-pause-help" className="muted">{canPause ? 'Closed inventory was acknowledged. Verify zero availability in Aiosell, then switch background sync off and Save connection to unlock mapping removal.' : 'Pausing is locked until every saved mapping is stop-sold and its inventory update is acknowledged. Save mappings remains available to close inventory.'}</p>}
      <div className="flex flex-wrap gap-2"><button className="secondary" onClick={() => run('save')}>Save connection</button><button className="secondary" disabled={!connection || !!form} onClick={() => run('mapping')}>Fetch Aiosell mapping</button></div>
      <p id="aiosell-save-help" className="muted">Save connection stores the hotel code, switch setting and mapping edits. Save mappings stores the same configuration. To send pending updates immediately, use Sync now.</p>
      <label>Restriction channel IDs (optional)<input value={channels ?? (connection?.restriction_channels || []).join(',')} onChange={e => setChannels(e.target.value)} placeholder="Comma-separated IDs confirmed by Aiosell" /></label>
      <p className="muted">Leave blank to discover inventory targets automatically. When none are returned, inventory and rates can still be sent; restrictions remain pending. Do not copy unrelated partner IDs.</p>
      <button className="secondary" disabled={!connection} onClick={saveChannels}>Save restriction targets</button>
      {remote && <div className="notice"><p>{remote.hotel_name} · {remote.currency} · {remote.timezone}</p><p>Confirm the currency is INR and the timezone matches this property.</p>{remote.rooms?.map(room => <p key={room.room_id}>{room.room_name}: <strong>{room.room_id}</strong> — {room.rateplans?.map(plan => `${plan.rateplan_name} (${plan.rateplan_id})`).join(', ')}</p>)}</div>}
      {current.mappings.map((mapping, index) => {
        const selected = units.filter(unit => !unit.archivedAt && mapping.unitIds.includes(unit.id));
        const prices = [...new Set(selected.map(unit => unit.nightlyRatePaise))];
        const validPrice = selected.length === mapping.unitIds.length && selected.length > 0 && prices.length === 1 && prices[0] > 0;
        const protectedMapping = !!connection?.enabled && index < savedMappings.length;
        return <div className="aiosell-mapping" key={index}><CollapsibleCard title={`Room mapping ${index + 1}`} defaultOpen={!mapping.roomCode}
          summary={<span>{mapping.roomCode || 'New mapping'} / {mapping.rateplanCode || 'Choose rate plan'}<br />{selected.length} {selected[0]?.type === 'BED' ? 'beds' : 'rooms'} selected · {validPrice ? `INR ${(prices[0] / 100).toFixed(2)} per ${selected[0].type === 'BED' ? 'bed' : 'room'} / night` : 'Check units and pricing'}{mapping.stopSell ? ' · Stop sell' : ''}</span>}>
        <div className="space-y-3">
        <label>Aiosell room code<input value={mapping.roomCode} readOnly={protectedMapping} aria-describedby={protectedMapping ? `mapping-lock-${index}` : undefined} onChange={e => {if (!protectedMapping) editMapping(index, {roomCode: e.target.value});}} /></label>
        {protectedMapping && <p id={`mapping-lock-${index}`} className="muted">This saved mapping is active. Its room code and Remove mapping button are locked until inventory is closed and the connection is paused. You can still change stop-sell, minimum nights and prices in Pricing.</p>}
        <label>Aiosell rate-plan code<input value={mapping.rateplanCode} onChange={e => editMapping(index, {rateplanCode: e.target.value})} /></label>
        <div className="notice">{(() => {
          return validPrice
            ? <p>Following Pricing: INR {(prices[0] / 100).toFixed(2)} per {selected[0].type === 'BED' ? 'bed' : 'room'} / night.</p>
            : <p role="alert">{prices.length > 1 ? 'Price conflict: mapped units have different prices. Match prices or split this category.' : 'Select active units and set a positive price in Pricing.'} Rates will not be published until corrected.</p>;
        })()}<Link to="/pricing" className="underline">Edit in Pricing</Link></div>
        <label>Minimum nights<input type="number" min="1" max="999" value={mapping.minimumStay} onChange={e => editMapping(index, {minimumStay: Number(e.target.value)})} /></label>
        <div className="aiosell-stop-control"><button type="button" role="switch" aria-label="Stop sell" aria-checked={mapping.stopSell} className="aiosell-stop-switch"
          onClick={() => setStopSellChange({index, roomCode: mapping.roomCode, enabled: !mapping.stopSell})}><span aria-hidden="true" /></button>
          <div><strong className={mapping.stopSell ? 'aiosell-stop-active' : undefined}>Stop sell: {mapping.stopSell ? 'On' : 'Off'}</strong><p className="muted">Closes this category to new online bookings after saving and syncing.</p></div>
        </div>
        <fieldset><legend>Sellable units (one room type and gender policy per mapping)</legend><div className="grid gap-2 sm:grid-cols-2">{units.filter(u => !u.archivedAt).map(unit => <label className="flex gap-2" key={unit.id}><input type="checkbox" checked={mapping.unitIds.includes(unit.id)} onChange={e => editMapping(index, {unitIds: e.target.checked ? [...mapping.unitIds, unit.id] : mapping.unitIds.filter(id => id !== unit.id)})} />{unit.roomName} / {unit.label} ({unit.type})</label>)}</div></fieldset>
        <button className="secondary" disabled={protectedMapping} aria-describedby={protectedMapping ? `mapping-lock-${index}` : undefined} onClick={() => {if (!protectedMapping) edit({mappings: current.mappings.filter((_, i) => i !== index)});}}>Remove mapping</button>
        </div></CollapsibleCard></div>;
      })}
      <div className="flex flex-wrap gap-2"><button className="secondary" onClick={() => edit({mappings: [...current.mappings, emptyMapping()]})}>Add room mapping</button><button className="primary" onClick={() => run('save')}>Save mappings</button><button className="secondary" disabled={!!form || !connection?.enabled} onClick={() => run('sync')}>Sync now</button><button className="secondary" onClick={() => query.refetch()}>Refresh status</button></div>
    </fieldset>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}
    {(syncResults || connection?.last_sync_results?.stages) && <div className="space-y-2" aria-label="Aiosell sync results">{Object.entries(syncResults || connection.last_sync_results.stages).map(([stage, result]) => <p key={stage}><strong>{stage[0].toUpperCase() + stage.slice(1)}: {result.status === 'sent' ? 'Sent' : result.status === 'pending' ? 'Pending' : 'Failed'}</strong> — {result.message}</p>)}</div>}
    {traceRows.length > 0 && <details className="notice" open={inventoryResult?.verification?.status === 'different'}><summary>Inventory sent / Aiosell read-back</summary>
      <p>Hotel: {inventoryResult.details.hotelCode} · Snapshot revision: {inventoryResult.details.revision}. Up to 60 room/date values across the first 14 dates; the full sync still covers 90 days.</p>
      <p>{inventoryResult.verification?.status === 'matched' ? 'Sampled counts matched at the time of this check.' : inventoryResult.verification?.status === 'different' ? 'Returned values differ or are missing. This does not by itself identify propagation delay or another writer.' : 'Read-back was not available. Sent counts show our request, not the current Aiosell inventory.'}</p>
      <div className="overflow-auto max-h-96"><table><thead><tr><th>Date</th><th>Category</th><th>Mapped units</th><th>Sent</th><th>Aiosell returned</th></tr></thead><tbody>{traceRows.map(row => <tr key={`${row.date}-${row.roomCode}`}><td>{row.date}</td><td>{row.roomCode}</td><td>{row.mappedUnits}</td><td>{row.sent}</td><td>{row.received == null ? ['matched','different'].includes(inventoryResult.verification?.status) ? 'Not returned' : 'Not checked' : row.received}</td></tr>)}</tbody></table></div>
    </details>}
    <p className="muted">Last successful sync: {connection?.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'Never'}{connection?.last_error ? ` · ${connection.last_error}` : ''}</p>
    <h3>Reservation events · {query.data?.reviewCount || 0} need review</h3><p className="notice">Events needing review temporarily close channel inventory for this property. Reconcile the reservation in Stayman against the latest booking in Aiosell, then enter its local booking reference to resolve the event. Modifications require manual review until event ordering is agreed with Aiosell. Up to 30 events appear, with reviews first.</p>
    {query.data?.events?.map(event => <div className="card space-y-2" key={event.id}><p>{event.channel} · {event.booking_id} · {event.action} · <strong>{event.status}</strong></p>{event.issue && <p>{event.issue}</p>}{event.payload?.checkin && <p>{event.payload.guest?.name} · {event.payload.checkin} to {event.payload.checkout} · INR {(event.payload.totalPaise / 100).toFixed(2)} · {event.payload.rooms?.map(r => r.roomCode).join(', ')}</p>}{event.status === 'REVIEW' && <form onSubmit={e => resolve(e, event.id)} className="flex flex-wrap gap-2"><input name="reservation" aria-label="Reconciled local booking reference" placeholder="Local booking reference or UUID" defaultValue={event.reservation_id || ''} required maxLength={120} /><button disabled={busy} className="secondary">Confirm reconciled</button></form>}</div>)}
  </div>;
}
