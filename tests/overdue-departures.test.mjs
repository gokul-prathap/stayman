import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceFixture,property,rpc} from '../qa/workspace-fixture.mjs';
import {departureReview} from '../src/features/reservations/utils/departureReview.js';

test('overdue flag respects property checkout time, timezone, extensions and explicit status',()=>{
 const p={timezone:'Asia/Kolkata',check_out_time:'11:00'},r={status:'CHECKED_IN',check_out_date:'2026-10-23',paid_amount:10000};
 assert.equal(departureReview(r,p,new Date('2026-10-23T05:29:59Z')),null);
 assert.equal(departureReview(r,p,new Date('2026-10-23T05:30:00Z')),'overdue');
 assert.equal(departureReview({...r,paid_amount:0},p,new Date('2026-10-23T05:30:00Z')),'overdue');
 assert.equal(departureReview({...r,check_out_date:'2026-10-24'},p,new Date('2026-10-23T05:30:00Z')),null);
 for(const status of ['CANCELLED','CHECKED_OUT'])assert.equal(departureReview({...r,status},p,new Date('2026-10-24T00:00:00Z')),null);
 assert.equal(departureReview({...r,status:'PENDING'},p,new Date('2026-10-24T00:00:00Z')),'past_pending');
 assert.equal(departureReview(r,{timezone:'America/New_York',check_out_time:'11:00:00'},new Date('2026-10-23T14:59:59Z')),null);
 assert.equal(departureReview(r,{timezone:'America/New_York',check_out_time:'11:00:00'},new Date('2026-10-23T15:00:00Z')),'overdue');
});

test('shared notifications include overdue and missed stays without changing money/status, remain scoped and capped',async()=>{
 const db=await createWorkspaceFixture(8);
 try{
 await db.exec(`alter table stayman_properties add check_out_time time default '11:00';
 update stayman_reservations set check_in_date=current_date-3,check_out_date=current_date-1,status='CHECKED_IN';
 update stayman_reservations set check_out_date=current_date where id=md5('r1')::uuid;
 update stayman_reservations set check_out_date=current_date+1 where id=md5('r2')::uuid;
 update stayman_reservations set status='CHECKED_OUT' where id=md5('r3')::uuid;
 update stayman_reservations set status='CANCELLED' where id=md5('r4')::uuid;
 update stayman_reservations set status='PENDING' where id in(md5('r5')::uuid,md5('r6')::uuid,md5('r7')::uuid);
 update stayman_reservations set check_in_date=current_date+1,check_out_date=current_date+2 where id=md5('r7')::uuid;
 insert into guest_checkin_invitations select md5('i'||i)::uuid,'${property}','public_qr','completed',jsonb_build_object('full_name','Guest '||i,'phone','PRIVATE','departure_date',(current_date+case when i=8 then -1 else 2 end)::text),now() from generate_series(5,9) i;
 insert into stayman_booking_members select md5('m'||i)::uuid,'${property}',md5('r'||i)::uuid,md5('g'||i)::uuid,'Guest '||i,md5('i'||i)::uuid from (values(5),(7)) x(i);`);
 const sql=await readFile(new URL('../supabase/migrations/202610230038_overdue_departures.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec('begin');
 await db.exec("update stayman_properties set check_out_time=((now() at time zone timezone)::time+interval '1 second')::time");
 let data=await rpc(db,'stayman_checkin_notifications',{p_property:property});
 assert.equal(data.overdue_count,1);assert.equal(data.missed.length,1);assert.equal(data.missed_walkins.length,1);assert.equal(data.upcoming.length,1);
 assert.equal(data.walkins.length,2);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);
 await db.exec("update stayman_properties set check_out_time=(now() at time zone timezone)::time");
 data=await rpc(db,'stayman_checkin_notifications',{p_property:property});assert.equal(data.overdue_count,2);
 const before=data.revision;
 await db.exec("update stayman_reservations set status='CHECKED_OUT' where id=md5('r0')::uuid");
 data=await rpc(db,'stayman_checkin_notifications',{p_property:property});assert.equal(data.overdue_count,1);assert.notEqual(data.revision,before);
 const untouched=(await db.query("select status,paid_amount from stayman_reservations where id=md5('r5')::uuid")).rows[0];assert.equal(untouched.status,'PENDING');assert.equal(untouched.paid_amount,100000);
 await db.exec(`insert into stayman_reservations select md5('overdue'||i)::uuid,'${property}',md5('g0')::uuid,'OLD-'||i,'CHECKED_IN',current_date-5,current_date-2,10000,0,now(),null,null from generate_series(1,150) i`);
 data=await rpc(db,'stayman_checkin_notifications',{p_property:property});assert.equal(data.overdue_count,151);assert.equal(data.overdue.length,100);
 await db.exec('commit');await db.exec("set qa.allowed='no'");await assert.rejects(rpc(db,'stayman_checkin_notifications',{p_property:property}),/Staff access/);
 }finally{await db.close();}
});
