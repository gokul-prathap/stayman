import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseError} from '../src/services/databaseErrors.js';

test('schema errors preserve their code and exact missing object',()=>{
 for(const error of [
  {code:'42P01',message:'relation "public.stayman_folio_payments" does not exist'},
  {code:'42703',message:'column r.cancelled_at does not exist'},
  {code:'PGRST202',message:'Could not find the function public.stayman_workspace_data in the schema cache'},
 ]){
  const result=databaseError(error);
  assert.ok(result.includes(error.code));assert.ok(result.includes(error.message));
  assert.equal(result.includes('006 through 013'),false);
 }
});
test('database errors retain booking conflict guidance and ordinary messages',()=>{
 assert.match(databaseError({code:'23P01'}),/occupied or under maintenance/);
 assert.equal(databaseError({message:'Staff access required.'}),'Staff access required.');
 assert.equal(databaseError(null),'Unable to save. Please try again.');
});
