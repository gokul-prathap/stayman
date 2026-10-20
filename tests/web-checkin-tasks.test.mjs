import test from 'node:test';
import assert from 'node:assert/strict';
import {webCheckinTasks} from '../src/features/reservations/utils/webCheckinTasks.js';
const today='2026-10-21';
test('navbar/dashboard count each pending booking once even when several guests submitted',()=>{
 const result=webCheckinTasks({walkins:[{id:'walkin'}],reservations:[{id:'booking',status:'PENDING',check_in_date:today,check_out_date:'2026-10-23'}],members:[{reservation_id:'booking',status:'completed'},{reservation_id:'booking',status:'completed'}]},today);
 assert.equal(result.count,2);assert.equal(result.due.length,1);
});
test('expired, cancelled, checked-in and unsubmitted reservations do not become pending alerts',()=>{
 const reservations=[['expired','PENDING',today],['cancelled','CANCELLED','2026-10-23'],['arrived','CHECKED_IN','2026-10-23'],['unsubmitted','PENDING','2026-10-23']].map(([id,status,departure])=>({id,status,check_in_date:'2026-10-20',check_out_date:departure}));
 const result=webCheckinTasks({reservations,members:reservations.map(row=>({reservation_id:row.id,status:row.id==='unsubmitted'?'pending':'completed'}))},today);
 assert.equal(result.count,0);assert.deepEqual(result.due,[]);
});
test('upcoming submissions remain visible separately without inflating actionable badge',()=>{
 const result=webCheckinTasks({reservations:[{id:'future',status:'PENDING',check_in_date:'2026-10-25',check_out_date:'2026-10-26'}],members:[{reservation_id:'future',status:'completed'}]},today);
 assert.equal(result.count,0);assert.equal(result.upcoming.length,1);
});
test('missing data safely produces an empty notification list',()=>{
 assert.deepEqual(webCheckinTasks(undefined,today),{walkins:[],due:[],upcoming:[],count:0});
});
