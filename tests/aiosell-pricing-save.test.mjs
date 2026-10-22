import test from 'node:test';
import assert from 'node:assert/strict';
import {syncSavedPricing} from '../src/services/aiosellPricing.js';

test('saving prices recognizes sent rates even if inventory or restrictions fail', async () => {
  const response = {results:{rates:{status:'sent'},restrictions:{status:'pending'}}};
  const client = {functions:{invoke:async (name,args) => {
    assert.equal(name,'aiosell-sync'); assert.deepEqual(args.body,{property:'property-1',action:'sync'});
    return {error:{context:{json:async()=>response}}};
  }}};
  assert.equal((await syncSavedPricing(client,'property-1')).state,'sent');
});
test('rate conflicts remain distinct from local save failure', async () => {
  const client = {functions:{invoke:async()=>({data:{results:{rates:{status:'failed',message:'Mapped units have different prices.'}}}})}};
  const result = await syncSavedPricing(client,'p');
  assert.equal(result.state,'failed'); assert.match(result.message,/different prices/);
});
test('active worker is pending, never falsely reported as sent', async () => {
  const client = {functions:{invoke:async()=>({data:{message:'No pending sync. Another worker may be active.'}})}};
  assert.equal((await syncSavedPricing(client,'p')).state,'pending');
});
test('network failure preserves the saved-and-queued message', async () => {
  const client = {functions:{invoke:async()=>{throw new Error('offline');}}};
  const result = await syncSavedPricing(client,'p');
  assert.equal(result.state,'failed'); assert.match(result.message,/remain saved and queued/);
});
