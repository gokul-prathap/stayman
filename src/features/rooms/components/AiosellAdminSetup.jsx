import React, {useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import AdminSection from '../../admin/AdminSection';
import StopSellConfirmation from './StopSellConfirmation';
import {Link} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ChevronDown} from 'lucide-react';
import {db} from '../../../services/stayman';
import {validateAiosellMappings,validateUnitAssignments,mappingPlans,mappingRows} from '../../../services/aiosellMappings';
import './aiosell-settings.css';
async function rpc(name,args){const {data,error}=await db().rpc(name,args);if(error)throw error;return data;}
async function invoke(body){
 const {data,error}=await db().functions.invoke('aiosell-sync',{body});
 if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||error.message);}
 if(data?.error)throw new Error(data.error);return data;
}
export default function AiosellAdminSetup({property,units,onDirtyChange,api}) {
 const call=api?.rpc||rpc,send=api?.invoke||invoke,mode=api?'preview':'live';
 const client=useQueryClient();
 const query=useQuery({queryKey:['aiosell-settings',mode,property.id],queryFn:()=>call('stayman_aiosell_settings',{p_property:property.id}),staleTime:30000,retry:false});
 const transitionQuery=useQuery({queryKey:['aiosell-transition',mode,property.id],queryFn:()=>call('stayman_admin_mapping_change',{p_property:property.id,p_action:'state'}),retry:false});
 const transition=transitionQuery.data;
 const connection=query.data?.connection;
 const [hotel,setHotel]=useState(null),[remote,setRemote]=useState(null),[draft,setDraft]=useState(null),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[syncResults,setSyncResults]=useState(null);
 const [channels,setChannels]=useState(null),[closing,setClosing]=useState(false),[verifiedClosed,setVerifiedClosed]=useState(false),[confirmed,setConfirmed]=useState(false),[review,setReview]=useState(false),[reopen,setReopen]=useState(false),[stopSellChange,setStopSellChange]=useState(null),[syncNotice,setSyncNotice]=useState(null);
 const saved=connection?.mappings||[],rows=draft||saved,hotelCode=hotel??connection?.hotel_code??'';
 const inventoryResult=(syncResults||connection?.last_sync_results?.stages)?.inventory;
 const traceRows=inventoryResult?.verification?.rows||inventoryResult?.details?.rows||[];
 const acknowledged=connection?.revision!=null && (connection.last_sync_results?.revision===connection.revision&&connection.last_sync_results?.stages?.inventory?.status==='sent' || connection.synced_revision===connection.revision&&!connection.last_error);
 const closed=saved.length>0&&saved.every(m=>m.stopSell)&&acknowledged;
 const locked=!!transition;
 useEffect(()=>{onDirtyChange?.(draft!==null||hotel!==null&&hotel!==connection?.hotel_code||channels!==null);},[draft,hotel,channels,connection?.hotel_code,onDirtyChange]);
 async function task(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message||'Aiosell request failed.');}finally{setBusy(false);}}
 const editRow=(index,changes)=>{setDraft(rows.map((m,i)=>i===index?{...m,...changes}:m));setReview(false);};
 async function refresh(){await transitionQuery.refetch();const result=await query.refetch();if(result.error)throw result.error;await Promise.all([client.invalidateQueries({queryKey:['aiosell-owner']}),client.invalidateQueries({queryKey:['aiosell-pricing',property.id]}),client.invalidateQueries({queryKey:['admin-console']})]);return result.data.connection;}
 async function sync(){const result=await send({property:property.id,action:'sync'});setSyncResults(result.results||null);setSyncNotice(result.message||'Update requested.');setMessage(result.message||'Update requested.');await refresh();return result;}
 async function connect(){
  if(!hotelCode.trim())throw new Error('Enter the hotel code supplied by Aiosell.');
  const data=await send({property:property.id,action:'mapping',hotelCode:hotelCode.trim()});
  if(!Array.isArray(data.rooms)||data.hotel_id!==hotelCode.trim())throw new Error('The returned property does not match this hotel code. Ask Aiosell to confirm access.');
  setRemote(data);setConfirmed(false);setReview(false);setReopen(false);
  setDraft(mappingRows(data,hotelCode.trim()===connection?.hotel_code?(draft||saved):[],units));setEditing(true);
  setMessage('Property found. Check the property details and confirm each suggested unit.');
 }
 function associationConfirmed(){return window.confirm('Save association for '+property.name+'?\nCurrent: '+(connection?.hotel_code||'Not connected')+'\nProposed: '+remote.hotel_name+' ('+remote.hotel_id+')\n'+(connection?.hotel_code&&connection.hotel_code!==remote.hotel_id?'Old inventory must close first. Linked bookings can block replacement. Owner review will be required again.':'The owner cannot activate until matches, prices and required setup are ready.'));}
 async function saveAssociation(){
  if(!remote||remote.hotel_id!==hotelCode.trim())throw new Error('Find and verify this property first.');
  if(connection?.mappings?.length&&connection.hotel_code!==remote.hotel_id)throw new Error('Review new matches and use Save & restart updates. The old association must close first.');
  if(!associationConfirmed())return;
  if(connection?.enabled){setMessage('This association is already saved. Review your mapping changes below.');return;}
  await call('stayman_aiosell_configure',{p_property:property.id,p_hotel:remote.hotel_id,p_enabled:false,p_mappings:connection?.hotel_code===remote.hotel_id?saved:[],p_revision:connection?.revision??null});
  setHotel(null);await refresh();setMessage('Verified association saved. Finish room matches before owner activation.');
 }
 async function activate(){
  if(!confirmed)throw new Error('Confirm the property details and unit matches first.');
  if(!remote||remote.hotel_id!==hotelCode.trim())throw new Error('Find this hotel before saving.');
  if(remote.currency!=='INR')throw new Error('This integration publishes INR only. Ask Aiosell to correct the property currency.');
  const mappings=validateUnitAssignments(validateAiosellMappings(rows.filter(m=>m.unitIds.length)),units);
  if(!mappings.length)throw new Error('Match at least one unit.');
  const used=mappings.flatMap(m=>m.unitIds);if(new Set(used).size!==used.length)throw new Error('A physical unit can only be assigned once.');
  if(connection?.hotel_code!==remote.hotel_id&&!associationConfirmed())return;
  if(saved.length){
   if(!window.confirm('Close the '+saved.length+' old mapped categories for this property, then save the reviewed matches? Existing bookings and intentionally closed sales remain unchanged. Closure must be accepted and checked in Aiosell before continuing.'))return;
   await call('stayman_admin_mapping_change',{p_property:property.id,p_action:'begin',p_revision:connection.revision,p_hotel:remote.hotel_id,p_mappings:mappings});
   await refresh();
   try{await sync();setMessage('Old inventory closure requested. Verify zero availability in Aiosell, then finish the saved change below.');}catch(e){throw new Error('Closure stage: '+e.message+'. Old association and proposed mappings are retained. Retry closure.');}
   return;
  }
  await call('stayman_aiosell_configure',{p_property:property.id,p_hotel:hotelCode.trim(),p_enabled:false,p_mappings:mappings,p_revision:connection?.revision??null});
  setDraft(null);setHotel(null);setEditing(false);setReview(false);await refresh();setMessage('Setup saved for owner review.');
 }
 async function finishTransition(){
  if(!verifiedClosed)throw new Error('Verify zero availability in Aiosell first.');
  await send({property:property.id,action:'mapping',hotelCode:transition.hotel});
  const result=await call('stayman_admin_mapping_change',{p_property:property.id,p_action:'apply',p_transition:transition.id,p_verified:true});
  setDraft(null);setHotel(null);setEditing(false);setReview(false);setRemote(null);setVerifiedClosed(false);await refresh();
  if(result.restart){try{await sync();setMessage('Mappings saved. Restart update requested; check individual delivery results below.');}catch(e){throw new Error('Mappings saved. Restart delivery failed: '+e.message+'. The new mappings remain saved; retry delivery.');}}
  else setMessage('Mappings saved. Owner review is required before online sales start.');
 }
 async function saveChannels(){await call('stayman_aiosell_channels',{p_property:property.id,p_channels:(channels??(connection?.restriction_channels||[]).join(',')).split(',').map(x=>x.trim()).filter(Boolean)});await refresh();setChannels(null);setMessage('Restriction targets saved.');}
 async function resolve(event,eventId){event.preventDefault();const reservation=new FormData(event.currentTarget).get('reservation');await task(async()=>{await call('stayman_aiosell_resolve',{p_event:eventId,p_reservation:reservation});await refresh();setMessage('Event reconciled. Inventory is queued for update.');});}
 if(query.isPending)return <p role="status">Loading Aiosell settings...</p>;
 if(query.error)return <p role="alert" className="error">{query.error.message}</p>;
 return <div className="card aiosell-setup space-y-4">
  {stopSellChange&&<StopSellConfirmation roomCode={stopSellChange.roomCode} enabled={stopSellChange.enabled} saveInstructions="This changes your draft. Review setup, then Save & restart updates to publish it. Existing bookings stay unchanged." onCancel={()=>setStopSellChange(null)} onConfirm={()=>{editRow(stopSellChange.index,{stopSell:stopSellChange.enabled});setStopSellChange(null);}}/>}
  {syncNotice&&createPortal(<aside role="status" aria-label="Aiosell update notification" className="fixed top-4 left-4 right-4 sm:left-auto sm:w-96 z-[100] rounded-xl border border-slate-300 bg-white text-slate-900 p-5 shadow-xl"><strong>Aiosell update</strong><button className="float-right" aria-label="Dismiss update notification" onClick={()=>setSyncNotice(null)}>Close</button><p>{syncNotice}</p></aside>,document.body)}
  <header className="aiosell-status"><div><h2>Aiosell channel manager</h2><p className="muted">Change everyday prices in Pricing. Bookings and updates are delivered automatically when connected and the scheduler is running.</p></div><strong className="aiosell-badge">{connection?.last_error?'Needs attention':!connection?'Not configured':!connection.setup_verified?'Setup incomplete':!connection.approved?'Owner review pending':connection.enabled?'Updates enabled':'Paused'}</strong></header>
  {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
  <fieldset disabled={busy} className="space-y-4">
   <div className="flex flex-wrap gap-2">

    <button className="secondary" onClick={()=>task(async()=>{await refresh();setMessage('Status refreshed.');})}>Refresh status</button>
    {connection?.enabled&&<button className="secondary" onClick={()=>task(sync)}>Retry update</button>}
   </div>
   <AdminSection property={property.id} id="connection" title="Property connection" description="Find the Aiosell property, check its details, then save the association." summary={connection?.hotel_code||'Not configured'}>
    <div className="aiosell-connect"><label>Hotel code<input disabled={locked} value={hotelCode} placeholder="Code supplied by Aiosell" maxLength={120} onChange={e=>{setHotel(e.target.value);setRemote(null);setConfirmed(false);setReview(false);}}/></label><button className="primary" disabled={locked} onClick={()=>task(connect)}>{busy?'Working...':'Connect & fetch units'}</button></div>
    {remote&&<div className="notice"><strong>{remote.hotel_name}</strong><p>{remote.currency} / {remote.timezone} / {remote.rooms.length} fetched categories</p><button className="secondary" disabled={locked} onClick={()=>task(saveAssociation)}>Save verified association</button></div>}<p className="muted">Finding another property does not replace the saved association. Changes with existing inventory use the guided save below.</p>
   </AdminSection>
   <AdminSection property={property.id} id="mappings" title="Room mappings" description="Stayman units on the left; real fetched Aiosell categories on the right." summary={rows.reduce((n,m)=>n+m.unitIds.length,0)+' units matched'}>
    {remote&&<p className="notice"><strong>{remote.hotel_name}</strong> / {remote.currency} / {remote.timezone}<br/>Hotel code: {remote.hotel_id}</p>}
    {!remote&&<p className="muted">Connect to load Aiosell categories and rate plans. Saved matches appear below.</p>}
    <div className="aiosell-match-list">{units.filter(u=>!u.archivedAt).map(unit=>{
     const index=rows.findIndex(m=>m.unitIds.includes(unit.id));const mapping=index>=0?rows[index]:null;
     const room=remote?.rooms?.find(r=>r.room_id===mapping?.roomCode);const plans=mapping?mappingPlans(mapping):[];
     return <article className="aiosell-match-row" key={unit.id}>
      <div><strong>{unit.roomName} / {unit.label}</strong><small>{unit.type==='BED'?'Physical bed':'Private room'}</small></div>
      <label>Matching Aiosell category<select aria-label={'Aiosell category for '+unit.label} disabled={locked||!remote} value={mapping?.roomCode||''} onChange={e=>{
       const next=rows.map(m=>({...m,unitIds:m.unitIds.filter(id=>id!==unit.id)}));const target=next.findIndex(m=>m.roomCode===e.target.value);if(target>=0)next[target]={...next[target],unitIds:[...next[target].unitIds,unit.id]};setDraft(next);setReview(false);
      }}><option value="">Don't sell this unit through Aiosell</option>{remote&&mapping&&!room&&<option value={mapping.roomCode}>Saved category unavailable</option>}{(remote?.rooms||saved.map(m=>({room_id:m.roomCode,room_name:m.roomName||m.roomCode}))).map(r=><option key={r.room_id} value={r.room_id}>{r.room_name||r.room_id}</option>)}</select></label>
      {remote&&mapping&&!room&&<p role="alert" className="error">Saved category no longer appears in this property. Choose a verified category or exclude this unit; it has not been remapped.</p>}<div><small>Base price from Pricing</small><strong>INR {(unit.nightlyRatePaise/100).toFixed(2)}</strong></div>
      {mapping&&<details className="aiosell-plan-details"><summary>Technical details & guest pricing <ChevronDown size={16}/></summary>
       <p>Room ID: {mapping.roomCode}. Availability is shared by {mapping.unitIds.length} physical unit(s), across all selected plans.</p>
       {(room?.rateplans||plans.map(p=>({rateplan_id:p.rateplanCode}))).map(plan=><label className="aiosell-plan-choice" key={plan.rateplan_id}><input type="checkbox" checked={plans.some(p=>p.rateplanCode===plan.rateplan_id)} disabled={locked} onChange={e=>editRow(index,{ratePlans:e.target.checked?[...plans,{rateplanCode:plan.rateplan_id,rateSource:'pricing'}]:plans.filter(p=>p.rateplanCode!==plan.rateplan_id)})}/>{plan.rateplan_name||plan.rateplan_id} ({plan.rateplan_id})</label>)}
       {unit.type==='ROOM'&&<div className="aiosell-admin-occupancy"><h4>Guest pricing rules</h4><p>The base room price covers up to the included guest count, including fewer guests. Extra charges apply only above that count. Match plan guest counts to Aiosell; do not infer them from plan suffixes.</p>
        <label>Guests included<input type="number" min="1" max="99" value={mapping.guestPricing?.includedGuests??''} onChange={e=>editRow(index,{guestPricing:{...mapping.guestPricing,includedGuests:Number(e.target.value)}})}/></label>
        <label>Maximum guests<input type="number" min="1" max={room?.max_occ||99} value={mapping.guestPricing?.maxGuests??''} onChange={e=>editRow(index,{guestPricing:{...mapping.guestPricing,maxGuests:Number(e.target.value)}})}/></label>
        <label>Extra guest per night (INR)<input type="number" min="0" step="0.01" value={mapping.guestPricing?.extraGuestPaise==null?'':mapping.guestPricing.extraGuestPaise/100} onChange={e=>editRow(index,{guestPricing:{...mapping.guestPricing,extraGuestPaise:Math.round(Number(e.target.value)*100)}})}/></label>
        {plans.map((plan,pi)=><label key={plan.rateplanCode}>{plan.rateplanCode}: guest count<input type="number" min="1" max={mapping.guestPricing?.maxGuests||99} value={plan.guestCount??''} onChange={e=>editRow(index,{ratePlans:plans.map((p,i)=>i===pi?{...p,guestCount:e.target.value?Number(e.target.value):null,rateSource:e.target.value?'occupancy':'pricing'}:p)})}/></label>)}
       </div>}
       <label>Minimum nights<input type="number" min="1" max="999" value={mapping.minimumStay} onChange={e=>editRow(index,{minimumStay:Number(e.target.value)})}/></label>
       <p>Owner sales preferences are preserved through closure and remapping.</p>
      </details>}
     </article>;
    })}</div>
    {rows.length>0&&<p className="muted">{rows.filter(m=>m.unitIds.length).length} categories matched / {units.filter(u=>!u.archivedAt&&!rows.some(m=>m.unitIds.includes(u.id))).length} units excluded. Several units can share a category only with the same type, gender policy and nightly price. Unmapped categories are not controlled by Stayman; verify they are closed in Aiosell.</p>}
   </AdminSection>
   {remote&&!transition&&<AdminSection property={property.id} id="mapping-review" title="Review & save" description="Save matched inventory safely; previously approved updates can restart." summary={confirmed?'Ready to review':'Review needed'}>
    <label className="aiosell-plan-choice"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setReview(false);}}/>I confirm this property, currency/timezone and each physical unit match. Unmapped categories are closed in Aiosell.</label>

    {!review?<button className="primary" disabled={!confirmed||remote.currency!=='INR'} onClick={()=>setReview(true)}>Review setup</button>:<div className="notice"><p>Prepare owner review for {rows.filter(m=>m.unitIds.length).length} categories. Existing room and site closures are preserved. New or replaced associations require owner approval. Existing reservations are unchanged.</p><div className="flex gap-2"><button className="primary" onClick={()=>task(activate)}>Save & restart updates</button><button className="secondary" onClick={()=>setReview(false)}>Back</button></div></div>}
   </AdminSection>}
   {transition&&<AdminSection property={property.id} id="mapping-progress" title="Finish saved mapping change" description="Old association stays in place until closure is accepted and verified." summary={closed?'Closure accepted':'Closure needs checking'}>
    <p>{transition.old_hotel} to {transition.hotel}. Closing {saved.length} old categories. Proposed matches are saved for retry.</p>
    <button className="secondary" onClick={()=>task(sync)}>Retry closure</button>
    <label className="aiosell-plan-choice"><input type="checkbox" checked={verifiedClosed} onChange={e=>setVerifiedClosed(e.target.checked)}/>I verified zero availability for the old mappings in Aiosell.</label>
    <button className="primary" disabled={!closed||!verifiedClosed} onClick={()=>task(finishTransition)}>Finish save & restart updates</button>
    <button className="secondary" onClick={()=>task(async()=>{if(!window.confirm('Discard the proposed mapping change? Old inventory stays closed; this does not reopen sales.'))return;await call('stayman_admin_mapping_change',{p_property:property.id,p_action:'cancel',p_transition:transition.id});setDraft(null);setRemote(null);setHotel(null);await refresh();setMessage('Draft discarded. Review the saved offering before reopening sales.');})}>Discard proposed change</button>
   </AdminSection>}
   <AdminSection property={property.id} id="restriction-settings" title="Technical restriction settings" description="Use only targets confirmed for this property." defaultOpen={false}><label>Restriction channel IDs<input value={channels??(connection?.restriction_channels||[]).join(',')} onChange={e=>setChannels(e.target.value)} placeholder="Only IDs confirmed by Aiosell"/></label><p className="muted">Leave blank for automatic discovery. Missing targets do not stop inventory or rates.</p><button className="secondary" disabled={!connection} onClick={()=>task(saveChannels)}>Save restriction targets</button></AdminSection>
  </fieldset>
    <AdminSection property={property.id} id="sites" title="Booking sites" description="Verify supported sales controls separately from OTA provisioning." summary={(query.data?.sites?.length||0)+' verified records'}><p className="muted">Returned inventory targets do not prove complete OTA setup. Verify the property connection and API control with Aiosell before enabling owner switches.</p>
     {[...new Set((remote?.connected_channels||query.data?.remote?.connected_channels||[]).filter(ch=>ch.operation==='inventory').map(ch=>ch.partner_id))].map(target=>{const site=query.data?.sites?.find(site=>site.target===target);return <AdminSection property={property.id} id={'site-'+target} title={site?.name||'Returned inventory target'} summary={site?.verified?'Configured':'Setup incomplete'} key={target} defaultOpen={false}><p>Target: {target}</p><button className="secondary" disabled={busy||!connection} onClick={()=>task(async()=>{const name=window.prompt('Readable booking-site name',site?.name||target);if(!name)return; if(!window.confirm('Confirm Aiosell has connected this inventory target and permits targeted stop-sell for this property?'))return;await call('stayman_aiosell_site_setup',{p_property:property.id,p_target:target,p_name:name,p_verified:true,p_accept:site?.desired_open??window.confirm('After owner approval, should this site accept bookings? Choose Cancel to prepare it with sales closed.')});await refresh();setMessage('Booking-site capability verified.');})}>Verify setup</button></AdminSection>;})}
     <p className="muted">If no inventory targets are returned, ask Aiosell to finish channel setup. Never use reservation-only or unrelated partner IDs.</p>
    </AdminSection>
    <AdminSection property={property.id} id="credentials" title="Credentials & webhook" description="Managed securely in the existing server configuration." defaultOpen={false}><p>Credentials remain in Supabase Edge Function secrets. Configure AIOSELL_API_USERNAME, AIOSELL_API_PASSWORD, AIOSELL_PARTNER_ID and AIOSELL_API_BASE_URL there. No secret values are stored or displayed in this page.</p><p>Reservation webhook: your project's /functions/v1/aiosell-webhook endpoint. Give Aiosell its dedicated inbound Basic Auth credentials through your existing private onboarding process.</p></AdminSection>
    <AdminSection property={property.id} id="diagnostics" title="Delivery & diagnostics" description="Saved, sent and remote acceptance are separate from OTA confirmation." summary={connection?.last_error?'Needs attention':'Delivery history'} defaultOpen={false}>
    {(syncResults || connection?.last_sync_results?.stages) && <div className="space-y-2" aria-label="Aiosell sync results">{Object.entries(syncResults || connection.last_sync_results.stages).map(([stage, result]) => <p key={stage}><strong>{stage[0].toUpperCase() + stage.slice(1)}: {result.status === 'sent' ? 'Sent' : result.status === 'pending' ? 'Pending' : result.status === 'skipped' ? 'Not requested' : 'Failed'}</strong> — {result.message}</p>)}</div>}
    {traceRows.length > 0 && <details className="notice" open={inventoryResult?.verification?.status === 'different'}><summary>Inventory sent / Aiosell read-back</summary>
      <p>Hotel: {inventoryResult.details.hotelCode} · Snapshot revision: {inventoryResult.details.revision}. Up to 60 room/date values across the first 14 dates; the full sync still covers 90 days.</p>
      <p>{inventoryResult.verification?.status === 'matched' ? 'Sampled counts matched at the time of this check.' : inventoryResult.verification?.status === 'different' ? 'Returned values differ or are missing. This does not by itself identify propagation delay or another writer.' : 'Read-back was not available. Sent counts show our request, not the current Aiosell inventory.'}</p>
      <div className="overflow-auto max-h-96"><table><thead><tr><th>Date</th><th>Category</th><th>Mapped units</th><th>Sent</th><th>Aiosell returned</th></tr></thead><tbody>{traceRows.map(row => <tr key={`${row.date}-${row.roomCode}`}><td>{row.date}</td><td>{row.roomCode}</td><td>{row.mappedUnits}</td><td>{row.sent}</td><td>{row.received == null ? ['matched','different'].includes(inventoryResult.verification?.status) ? 'Not returned' : 'Not checked' : row.received}</td></tr>)}</tbody></table></div>
    </details>}
    <p className="muted">Last successful sync: {connection?.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'Never'}{connection?.last_error ? ` · ${connection.last_error}` : ''}</p>
    <details><summary>Recent booking diagnostics</summary>{query.data?.events?.map(event=><p key={event.id}>{event.channel} / {event.booking_id} / {event.status} / {event.issue}</p>)}</details></AdminSection>
  </div>;
}
