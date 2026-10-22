import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTrace,compareInventory} from '../supabase/functions/_shared/aiosellInventory.mjs';
import {aiosellRequest} from '../supabase/functions/_shared/aiosell.mjs';
const job=()=>({hotelCode:'sandbox-pms',revision:12,mappings:[{roomCode:'executive',unitIds:['room101','room102']},{roomCode:'suite',unitIds:['bedA','bedB','bedC','bedD']}],
  updates:[{startDate:'2026-10-24',endDate:'2026-10-24',rooms:[{roomCode:'executive',available:2},{roomCode:'suite',available:4}]}]});
test('two rooms and four beds are traced separately, never inferred from room-code labels',()=>{
  const trace=inventoryTrace(job());
  assert.deepEqual(trace.rows.map(r=>[r.roomCode,r.mappedUnits,r.sent]),[['executive',2,2],['suite',4,4]]);
});
test('reversed outbound counts fail the capacity guard before a request can be sent',()=>{
  const reversed=job(); reversed.updates[0].rooms[0].available=4;
  assert.throws(()=>inventoryTrace(reversed),/exceeds mapped capacity/);
});
test('diagnostics sample 14 dates but the capacity guard validates the entire outgoing horizon',()=>{
  const snapshot=job(); snapshot.updates=Array.from({length:30},(_,index)=>{const date=new Date(Date.UTC(2026,9,22+index)).toISOString().slice(0,10);return {startDate:date,endDate:date,rooms:[{roomCode:'executive',available:2},{roomCode:'suite',available:4}]};});
  assert.equal(inventoryTrace(snapshot).rows.length,28);
  snapshot.updates[29].rooms[0].available=9;
  assert.throws(()=>inventoryTrace(snapshot),/exceeds mapped capacity/);
});
test('read-back distinguishes matches, swapped inventory and missing dates',()=>{
  const snapshot=job(),trace=inventoryTrace(snapshot);
  assert.equal(compareInventory(trace,{hotelCode:snapshot.hotelCode,updates:snapshot.updates}).status,'matched');
  const wrong=job(); wrong.updates[0].rooms[0].available=4; wrong.updates[0].rooms[1].available=2;
  const result=compareInventory(trace,{hotelCode:wrong.hotelCode,updates:wrong.updates});
  assert.equal(result.status,'different'); assert.deepEqual(result.rows.map(r=>[r.sent,r.received]),[[2,4],[4,2]]);
  assert.equal(compareInventory(trace,{hotelCode:snapshot.hotelCode,updates:[]}).status,'different');
});
test('Fetch Inventory accepts its documented dataset shape without a write-success flag',async()=>{
  const snapshot=job(),env=key=>({AIOSELL_API_USERNAME:'synthetic',AIOSELL_API_PASSWORD:'synthetic'}[key]);
  const result=await aiosellRequest('/data/sample-pms',{type:'inventory',hotelCode:snapshot.hotelCode},env,async()=>new Response(JSON.stringify({hotelCode:snapshot.hotelCode,updates:snapshot.updates})));
  assert.equal(result.updates[0].rooms[0].available,2);
  await assert.rejects(aiosellRequest('/data/sample-pms',{type:'inventory',hotelCode:snapshot.hotelCode},env,async()=>new Response('{}')),/unrecognized/);
});
