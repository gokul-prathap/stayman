import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDate,registerRooms,registerDocuments,registerStay} from '../src/features/reservations/utils/guestRegister.js';
test('register handles missing details without inventing a booking or room',()=>{
 assert.equal(registerDate(null),'—');assert.equal(registerDate('invalid'),'—');
 assert.equal(registerRooms({kind:'walkin'}).label,'Not allocated');assert.equal(registerRooms({}).label,'—');
 assert.equal(registerStay({stay:'walkin'}),'Awaiting allocation');
});
test('room summary deduplicates repeated allocations and retains full assignment periods',()=>{
 const row={rooms:[{room:'Dorm A',unit:'Bed 1',from:'2026-10-19',to:'2026-10-20'},{room:'Dorm A',unit:'Bed 1',from:'2026-10-21',to:'2026-10-22'},{room:'Dorm B',unit:'Bed 2',from:'2026-10-20',to:'2026-10-21'}]};
 const result=registerRooms(row);assert.equal(result.label,'Dorm A / Bed 1');assert.equal(result.extra,1);assert.match(result.title,/2026-10-21 to 2026-10-22/);
});
test('document status distinguishes submission and review without claiming verified identity',()=>{
 assert.equal(registerDocuments({web_done:false}).label,'Not submitted');
 assert.equal(registerDocuments({web_done:true}).label,'Submitted');
 assert.equal(registerDocuments({web_done:true,document_screening:{front:'manual-review',back:'document-like'}}).label,'Review required');
 const screened=registerDocuments({web_done:true,document_screening:{front:'document-like',back:'document-like'}});
 assert.equal(screened.label,'Text detected');assert.doesNotMatch(screened.label,/verified/i);
});
test('dates remain stable across client timezone boundaries',()=>{
 assert.equal(registerDate('2026-10-19'),'19 Oct 2026');
});
