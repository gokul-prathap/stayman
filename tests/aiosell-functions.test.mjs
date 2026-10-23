import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as core from '../supabase/functions/_shared/aiosell.mjs';
import {inventoryTrace,compareInventory} from '../supabase/functions/_shared/aiosellInventory.mjs';

async function load(name, env, createClient, requestApi = core.aiosellRequest) {
  let handler;
  const source = (await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  const {code} = await transform(source, {loader: 'ts', target: 'es2022'});
  new Function('Deno', 'createClient', 'basicMatches', 'normalizeReservation', 'aiosellRequest', 'inventoryTrace', 'compareInventory', code)(
    {env: {get: key => env[key]}, serve: callback => {handler = callback;}}, createClient, core.basicMatches, core.normalizeReservation, requestApi, inventoryTrace, compareInventory);
  return handler;
}
const request = (body, authorization = '', origin = '') => new Request('https://example.invalid/function', {method: 'POST', headers: {'Content-Type': 'application/json', authorization, origin}, body: JSON.stringify(body)});
test('actual webhook handler rejects auth and acknowledges only durable DB receipt', async () => {
  let received;
  const payload = {action: 'cancel', hotelCode: 'test', channel: 'test', bookingId: 'test', creditCard: {cvv: 'discard'}};
  let fail = false;
  const handler = await load('aiosell-webhook', {AIOSELL_WEBHOOK_USERNAME: 'synthetic', AIOSELL_WEBHOOK_PASSWORD: 'test'}, () => ({rpc: async (_, args) => {received = args.p_payload; return fail ? {error: {message: 'private DB detail'}} : {data: {success: true}};}}));
  assert.equal((await handler(request(payload))).status, 401);
  const auth = 'Basic ' + btoa('synthetic:test');
  assert.equal((await handler(request(payload, auth))).status, 200);
  assert.equal(received.creditCard, undefined);
  fail = true; const response = await handler(request(payload, auth)); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private DB'));
});
test('sync handler enforces owner access, forwards saved hotel mapping, and handles worker retry', async () => {
  let finish, calls = [], owner = false;
  const job = {property: 'test', hotelCode: 'sandbox-pms', lease: 'lease', revision: 4, startDate: '2027-01-01', endDate: '2027-03-31', blocked: true,
    updates: [{startDate:'2027-01-01',endDate:'2027-01-01',rooms:[{roomCode:'suite',available:0}]}], mappings: [{roomCode: 'suite', unitIds:['synthetic-one'],rateplanCode: 'suite-ep', ratePaise: 123456, minimumStay: 2, stopSell: false}]};
  const client = {from: () => ({select: () => ({eq: () => ({single: async () => ({data: {restriction_channels: []}})})})}), auth: {getUser: async () => ({data: {user: {id: 'owner'}}})}, rpc: async (name, args) => {
    if (name === 'stayman_is_owner') return {data: owner};
    if (name === 'stayman_aiosell_claim') return {data: job};
    if (name === 'stayman_aiosell_finish_result') {finish = args; return {};}
  }};
  let rejected = false;
  const api = async (path, body) => {calls.push({path, body}); if (rejected) throw new Error('Aiosell HTTP 429.'); return body?.type==='inventory' ? {hotelCode:job.hotelCode,updates:job.updates} : body ? {success: true} : {connected_channels: [{operation: 'inventory', partner_id: 'synthetic-channel'}]};};
  const handler = await load('aiosell-sync', {AIOSELL_ALLOWED_ORIGINS: 'https://stayman.invalid', AIOSELL_WORKER_SECRET: 'synthetic-worker'}, () => client, api);
  assert.equal((await handler(request(null))).status, 400);
  assert.equal((await handler(request({action: 'sync', property: 'test'}, 'Bearer user', 'https://attacker.invalid'))).status, 403);
  assert.equal((await handler(request({action: 'sync', property: 'test'}, 'Bearer user', 'https://stayman.invalid'))).status, 403);
  owner = true;
  assert.equal((await handler(request({action: 'sync', property: 'test'}, 'Bearer user', 'https://stayman.invalid'))).status, 200);
  assert.equal(calls.length, 5); assert.equal(calls[1].body.updates[0].rates[0].rate, 1234.56);
  assert.equal(calls[4].body.updates[0].rooms[0].restrictions.stopSell, true);
  assert.equal(finish.p_results.inventory.verification.status,'matched');
  assert.equal(finish.p_results.inventory.verification.rows,undefined);
  assert.equal(finish.p_results.inventory.details.rows[0].received,0);
  assert.equal(finish.p_error, null); assert.equal(finish.p_revision, 4);
  rejected = true;
  assert.equal((await handler(request({action: 'sync'}, 'Bearer synthetic-worker'))).status, 502);
  assert.match(finish.p_error, /inventory: Aiosell HTTP 429/);
  assert.equal(finish.p_results.rates.status, 'failed');
});

test('missing sandbox channels keeps inventory/rates successful and persists restrictions pending', async () => {
  let finish; const calls = []; let configured = [];
  const job = {property: 'test', hotelCode: 'sandbox-pms', lease: 'lease', revision: 7, mappings: [{roomCode:'suite',unitIds:['synthetic-one'],rateplanCode:'suite-ep',ratePaise:120000,minimumStay:1}], updates: [{startDate:'2027-01-01',endDate:'2027-01-01',rooms:[{roomCode:'suite',available:1}]}]};
  const client = {from: () => ({select: () => ({eq: () => ({single: async () => ({data: {restriction_channels: configured}})})})}),
    rpc: async (name, args) => {if (name === 'stayman_aiosell_claim') return {data: job}; if(name==='stayman_no_show_claim')return {data:null}; finish = args; return {};}};
  const handler = await load('aiosell-sync', {AIOSELL_WORKER_SECRET: 'test-worker'}, () => client, async (path, body) => {
    calls.push({path, body}); return body ? {success: true} : {connected_channels: [{operation: null, partner_id: 'unrelated'}, {operation: 'reservation', partner_id: 'sample-ota'}]};
  });
  const response = await handler(request({action: 'sync'}, 'Bearer test-worker'));
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.status, 'partial'); assert.equal(data.results.inventory.status, 'sent'); assert.equal(data.results.rates.status, 'sent');
  assert.equal(data.results.restrictions.status, 'pending'); assert.equal(calls.length, 3);
  assert.equal(finish.p_results.restrictions.status, 'pending'); assert.match(finish.p_error, /restrictions/);
  // Only explicitly confirmed targets are used, and they avoid a property lookup.
  configured = ['confirmed-test-target']; calls.length = 0;
  const complete = await handler(request({action: 'sync'}, 'Bearer test-worker'));
  assert.equal((await complete.json()).status, 'complete'); assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].body.toChannels, configured); assert.equal(finish.p_error, null);
  job.mappings[0].ratePaise = null; job.mappings[0].priceError = 'Mapped units have different prices.'; calls.length = 0;
  const conflict = await handler(request({action:'sync'},'Bearer test-worker'));
  assert.equal(conflict.status,502); const conflictData = await conflict.json();
  assert.equal(conflictData.results.inventory.status,'sent'); assert.equal(conflictData.results.rates.status,'failed');
  assert.match(conflictData.results.rates.message,/different prices/);
  assert.ok(!calls.some(call=>call.path.includes('update-rates')));
});

test('no-show handler sends documented payload and requires owner/provider verification for retries',async()=>{
 let owner=true,needsVerification=false,finished,calls=[];
 const task={reservation:'r',property:'p',hotelCode:'sandbox-pms',bookingId:'OTA-123',channel:'booking.com',lease:'lease'};
 const client={auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async(name,args)=>{
  if(name==='stayman_is_owner')return {data:owner};
  if(name==='stayman_no_show_sync_state')return {data:{can_send:true,needs_verification:needsVerification}};
  if(name==='stayman_no_show_claim')return {data:task};
  if(name==='stayman_no_show_finish'){finished=args;return {};}
 }};
 const handler=await load('aiosell-sync',{AIOSELL_ALLOWED_ORIGINS:'https://stayman.invalid',AIOSELL_PARTNER_ID:'pms-slug'},()=>client,async(path,body)=>{calls.push({path,body});return {success:true};});
 let response=await handler(request({action:'noshow',property:'p',reservation:'r'},'Bearer user','https://stayman.invalid'));
 assert.equal(response.status,200);assert.equal(calls[0].path,'/marknoshow/pms-slug');assert.deepEqual(calls[0].body,{hotelCode:'sandbox-pms',bookingId:'OTA-123',channel:'booking.com'});assert.equal(finished.p_error,null);
 needsVerification=true;response=await handler(request({action:'noshow',property:'p',reservation:'r'},'Bearer user','https://stayman.invalid'));assert.equal(response.status,409);assert.equal(calls.length,1);
 owner=false;response=await handler(request({action:'noshow',property:'p',reservation:'r',verified:true},'Bearer user','https://stayman.invalid'));assert.equal(response.status,403);
 owner=true;const failing=await load('aiosell-sync',{AIOSELL_ALLOWED_ORIGINS:'https://stayman.invalid'},()=>client,async()=>{throw new Error('Timeout');});
 response=await failing(request({action:'noshow',property:'p',reservation:'r',verified:true},'Bearer user','https://stayman.invalid'));assert.equal(response.status,409);assert.equal(finished.p_error,'Timeout');assert.match((await response.json()).message,/provider/);
});
