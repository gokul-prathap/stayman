import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAiosellMappings} from '../src/services/aiosellMappings.js';
test('distinct executive/suite codes save and whitespace is trimmed without mutating the draft', () => {
  const input = [{roomCode:' executive ',rateplanCode:' executive-s-ep ',unitIds:['one']},{roomCode:'suite',rateplanCode:'suite-s-ep',unitIds:['two']}];
  const result=validateAiosellMappings(input);
  assert.equal(result[0].roomCode,'executive'); assert.equal(result[0].rateplanCode,'executive-s-ep');
  assert.equal(input[0].roomCode,' executive '); assert.deepEqual(result[0].unitIds,['one']);
});
test('unfinished extra mapping is identified rather than called a duplicate', () => {
  assert.throws(()=>validateAiosellMappings([{roomCode:'executive',rateplanCode:'ep'},{roomCode:'suite',rateplanCode:'ep'},{roomCode:' ',rateplanCode:''}]),/Room mapping 3:.*unfinished/);
});
test('duplicate room categories name both cards even when rate plans differ', () => {
  assert.throws(()=>validateAiosellMappings([{roomCode:'executive',rateplanCode:'s-ep'},{roomCode:'executive ',rateplanCode:'d-ep'}]),/Room mappings 1 and 2.*executive/);
});
test('missing rate plan and overlong codes have their own explanations', () => {
  assert.throws(()=>validateAiosellMappings([{roomCode:'suite',rateplanCode:''}]),/rate-plan code/);
  assert.throws(()=>validateAiosellMappings([{roomCode:'x'.repeat(121),rateplanCode:'ep'}]),/120 characters/);
});
