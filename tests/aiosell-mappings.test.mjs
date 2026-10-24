import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAiosellMappings,validateUnitAssignments,mappingRows,suggestUnit} from '../src/services/aiosellMappings.js';
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


test('guided mapping suggests only unambiguous units and preserves saved mappings',()=>{
 const units=[{id:'a',roomName:'MDR',label:'Bed 1'},{id:'b',roomName:'MDRA',label:'Bed 1'}];
 assert.equal(suggestUnit({room_id:'bed-1'},units),null);
 assert.equal(suggestUnit({room_id:'mdr-bed-1'},units),'a');
 const rows=mappingRows({rooms:[{room_id:'mdr-bed-1',rateplans:[{rateplan_id:'single'},{rateplan_id:'double'}]}]},[],units);
 assert.deepEqual(rows[0].unitIds,['a']);assert.equal(rows[0].ratePlans.length,2);
 assert.equal(mappingRows({rooms:[]},rows,units).length,1,'disappeared mappings cannot be silently lost');
});
test('multiple plans belong to one room category and reject duplicates',()=>{
 assert.equal(validateAiosellMappings([{roomCode:'private',ratePlans:[{rateplanCode:'s'},{rateplanCode:'d'}]}])[0].rateplanCode,'s');
 assert.throws(()=>validateAiosellMappings([{roomCode:'private',ratePlans:[{rateplanCode:'s'},{rateplanCode:'s'}]}]),/distinct rate plans/);
});

test('shared category permits equal-priced compatible units, rejects overlap and incompatible aggregates',()=>{
 const units=[{id:'a',type:'BED',genderPolicy:'ANY',nightlyRatePaise:60000},{id:'b',type:'BED',genderPolicy:'ANY',nightlyRatePaise:60000}];
 const maps=[{roomCode:'dorm',unitIds:['a','b']}];
 assert.equal(validateUnitAssignments(maps,units),maps);
 assert.throws(()=>validateUnitAssignments(maps,[units[0],{...units[1],nightlyRatePaise:70000}]),/same nightly price/);
 assert.throws(()=>validateUnitAssignments(maps,[units[0],{...units[1],genderPolicy:'FEMALE_ONLY'}]),/gender policies/);
 assert.throws(()=>validateUnitAssignments([...maps,{unitIds:['a']}],units),/distinct active/);
});
