import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {aiosellRequest} from '../_shared/aiosell.mjs';
import {inventoryTrace, compareInventory} from '../_shared/aiosellInventory.mjs';

Deno.serve(async request => {
  const allowed = (Deno.env.get('AIOSELL_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim());
  const origin = request.headers.get('origin') || '';
  const headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'};
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (request.method !== 'POST') return reply({error: 'POST required.'}, 405);
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  let body;
  try { body = await request.json(); } catch { return reply({error: 'Invalid request.'}, 400); }
  if (!body || typeof body !== 'object' || !['mapping', 'sync', 'noshow'].includes(body.action)) return reply({error: 'Invalid request.'}, 400);
  const cronSecret = Deno.env.get('AIOSELL_WORKER_SECRET');
  const worker = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;
  let caller: any;
  if (!worker) {
    if (!allowed.includes(origin)) return reply({error: 'Origin is not allowed.'}, 403);
    caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {global: {headers: {Authorization: request.headers.get('authorization') || ''}}, auth: {persistSession: false}});
    const {data, error} = await caller.auth.getUser();
    if (error || !data.user) return reply({error: 'Sign in again.'}, 401);
    const {data: owner} = await caller.rpc('stayman_is_owner', {p_property: body.property});
    if (owner !== true) return reply({error: 'Owner access required.'}, 403);
  }
  const partner = Deno.env.get('AIOSELL_PARTNER_ID') || 'sample-pms';
  const env = (name: string) => Deno.env.get(name);
  if (body.action === 'mapping' && !worker) {
    const {data: connection, error} = await service.from('stayman_aiosell_connections').select('hotel_code').eq('property_id', body.property).single();
    if (error) return reply({error: 'Save the hotel code first.'}, 400);
    try { return reply(await aiosellRequest(`/property_details/${encodeURIComponent(connection.hotel_code)}?partnerId=${encodeURIComponent(partner)}`, null, env)); }
    catch (error) { return reply({error: error instanceof Error ? error.message : 'Mapping fetch failed.'}, 502); }
  }
  if (body.action === 'noshow') {
    if (worker || !body.reservation) return reply({error:'Owner-confirmed reservation required.'},403);
    const {data:state,error:stateError}=await caller.rpc('stayman_no_show_sync_state',{p_reservation:body.reservation});
    if(stateError||!state?.can_send)return reply({error:'No no-show update is available for this booking.'},409);
    if(state.needs_verification&&body.verified!==true)return reply({error:'Verify the provider booking status before retrying this no-show.'},409);
  }
  const sendNoShow=async(manual=false)=>{
    const claim=await service.rpc('stayman_no_show_claim',{p_property:worker?null:body.property,p_reservation:manual?body.reservation:null,p_manual:manual});
    if(claim?.error)return {status:'review',message:'No-show queue could not be read. Check database setup.'};
    const task=claim?.data;if(!task)return null;
    let failure:string|null=null;
    try{await aiosellRequest(`/marknoshow/${encodeURIComponent(partner)}`,{hotelCode:task.hotelCode,bookingId:task.bookingId,channel:task.channel},env);}
    catch(error){failure=error instanceof Error?error.message:'No-show request failed.';}
    const {error:saveError}=await service.rpc('stayman_no_show_finish',{p_reservation:task.reservation,p_lease:task.lease,p_error:failure});
    return {status:saveError||failure?'review':'sent',message:saveError?'Acknowledgement could not be saved. Verify the provider status before retrying.':failure?'Verify the provider status before retrying; the request may have been applied.':'No-show accepted by Aiosell.'};
  };
  if(body.action==='noshow'){
    const result=await sendNoShow(true);
    return reply(result||{status:'review',message:'Another no-show attempt is active or the queue changed.'},result?.status==='sent'?200:409);
  }
  if (body.action !== 'sync') return reply({error: 'Unknown action.'}, 400);
  const {data: job, error} = await service.rpc('stayman_aiosell_claim', {p_property: worker ? null : body.property});
  if (error) return reply({error: 'Could not claim sync job.'}, 503);
  if (!job) {const noShow=await sendNoShow();return reply({message:'No pending inventory sync. Another worker may be active.',...(noShow?{no_show:noShow}:{})});}
  const results: Record<string, {status: string; message: string; details?: any; verification?: any}> = {};
  const attempt = async (stage: string, action: () => Promise<unknown>) => {
    try { await action(); results[stage] ||= {status: 'sent', message: 'Accepted by Aiosell; verify in sandbox UI.'}; }
    catch (error) { results[stage] = {status: 'failed', message: error instanceof Error ? error.message : 'Request failed.'}; }
  };
  // Independent stages preserve successful results even when another stage fails.
  await attempt('inventory', async () => {
    const details = inventoryTrace(job);
    await aiosellRequest(`/update/${encodeURIComponent(partner)}`, {hotelCode: job.hotelCode, updates: job.updates}, env);
    results.inventory = {status:'sent', message:'Accepted by Aiosell.', details};
  });
  await attempt('rates', async () => {
    const invalid = job.mappings.find((m: any) => m.priceError || !Number.isSafeInteger(m.ratePaise) || m.ratePaise <= 0);
    if (invalid) throw new Error(`${invalid.roomCode}: ${invalid.priceError || 'Set a positive price in Pricing.'}`);
    await aiosellRequest(`/update-rates/${encodeURIComponent(partner)}`, {hotelCode: job.hotelCode, updates: [{startDate: job.startDate, endDate: job.endDate,
      rates: job.mappings.map((m: any) => ({roomCode: m.roomCode, rateplanCode: m.rateplanCode, rate: m.ratePaise / 100}))}]}, env);
  });
  // One bounded read after owner-triggered syncs; scheduled jobs add no read-back traffic.
  if (!worker && results.inventory.status === 'sent') {
    try {
      const details = results.inventory.details;
      const lastDate = details.rows[details.rows.length - 1].date;
      const data = await aiosellRequest(`/data/${encodeURIComponent(partner)}`, {type:'inventory',hotelCode:job.hotelCode,startDate:details.rows[0].date,endDate:lastDate}, env);
      const comparison = compareInventory(details, data);
      // Store sent and returned counts once, not in two parallel arrays.
      details.rows = comparison.rows.map(({match, ...row}: any) => row);
      results.inventory.verification = {status:comparison.status, checked:comparison.rows.length, mismatches:comparison.rows.filter((row: any)=>!row.match).length};
      if (results.inventory.verification.status === 'different') {
        results.inventory.status = 'pending';
        results.inventory.message = 'Inventory was accepted, but Aiosell read-back differs. Check the sent/returned counts below; propagation delay or another writer may be involved.';
      } else results.inventory.message = 'Accepted; sampled inventory matches Aiosell read-back.';
    } catch (error) {
      results.inventory.verification = {status:'unavailable'};
      results.inventory.message = 'Accepted; read-back could not be verified. The sent counts below are not proof of current Aiosell values.';
    }
  }
  await attempt('restrictions', async () => {
    const {data: config, error: configError} = await service.from('stayman_aiosell_connections').select('restriction_channels').eq('property_id', job.property).single();
    if (configError) throw new Error('Could not load restriction targets. Apply migration 028.');
    let channels = config?.restriction_channels || [];
    if (!channels.length) {
      const property = await aiosellRequest(`/property_details/${encodeURIComponent(job.hotelCode)}?partnerId=${encodeURIComponent(partner)}`, null, env);
      channels = [...new Set((property.connected_channels || []).filter((c: any) => c.operation === 'inventory' && typeof c.partner_id === 'string' && c.partner_id.trim()).map((c: any) => c.partner_id))];
    }
    if (!channels.length) {
      results.restrictions = {status: 'pending', message: 'Not sent: no inventory channel targets. Add Aiosell-confirmed restriction channels in Settings.'};
      return;
    }
    await aiosellRequest(`/update/${encodeURIComponent(partner)}`, {hotelCode: job.hotelCode, toChannels: channels, updates: [{startDate: job.startDate, endDate: job.endDate,
      rooms: job.mappings.map((m: any) => ({roomCode: m.roomCode, restrictions: {stopSell: job.blocked || m.stopSell, minimumStay: m.minimumStay}}))}]}, env);
  });
  // The no-target branch must remain pending, not become a successful stage.
  const incomplete = Object.entries(results).filter(([, result]) => result.status !== 'sent');
  const failure = incomplete.length ? incomplete.map(([stage, result]) => `${stage}: ${result.message}`).join(' ') : null;
  const {error: finishError} = await service.rpc('stayman_aiosell_finish_result', {p_property: job.property, p_lease: job.lease, p_revision: job.revision, p_results: results, p_error: failure});
  if (finishError) return reply({error: 'Sync completion could not be saved; a retry will reconcile it.'}, 503);
  const noShow=await sendNoShow();
  const failed = Object.values(results).some(result => result.status === 'failed');
  return reply({...(noShow?{no_show:noShow}:{}),status: failed ? 'failed' : failure ? 'partial' : 'complete', results,
    message: failure ? 'Sync partially completed. Review the individual results below.' : 'Inventory, rates and restrictions sent to Aiosell.',
    ...(failed ? {error: failure} : {warning: failure})}, failed ? 502 : 200);
});
