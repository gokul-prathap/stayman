import test from 'node:test';
import assert from 'node:assert/strict';
import {identityPolicy,identityUploadSides} from '../src/features/rooms/utils/identityPolicy.js';
import {documentTextResult} from '../src/features/rooms/utils/identityScreening.js';
test('licence spellings require only the front and include an optional back when supplied',()=>{
 for(const document_type of ['DRIVING_LICENSE','driving licence','licence','license','DL']){
  assert.deepEqual(identityPolicy({document_type}).required,['front']);
  assert.deepEqual(identityUploadSides({document_type},{front:{}}),['front']);
  assert.deepEqual(identityUploadSides({document_type},{front:{},back:{}}),['front','back']);
 }
});
test('PAN aliases and unsupported ID types cannot be selected',()=>{
 for(const document_type of ['PAN','pan card','pancard'])assert.throws(()=>identityPolicy({document_type}),/PAN cards are not accepted/);
 assert.throws(()=>identityPolicy({document_type:'OTHER'}),/accepted identity/);
});
test('other domestic IDs and foreign passport/visa retain both-photo requirements',()=>{
 for(const document_type of ['AADHAAR','VOTER_ID','PASSPORT'])assert.deepEqual(identityPolicy({document_type}).required,['front','back']);
 assert.deepEqual(identityPolicy({foreign_guest:true}).required,['front','back']);
 assert.throws(()=>identityPolicy({foreign_guest:true,document_type:'DRIVING_LICENSE'}),/passport and visa/);
});
test('PAN text is rejected even when generic government ID cues would otherwise match',()=>{
 const result=documentTextResult('INCOME TAX DEPARTMENT GOVERNMENT OF INDIA PERMANENT ACCOUNT NUMBER NAME SAMPLE PERSON DOB 01/01/1990 ABCDE1234F');
 assert.equal(result.accepted,false);assert.equal(result.reason,'pan-not-accepted');
});
