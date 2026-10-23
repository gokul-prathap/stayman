import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceFixture,property,rpc} from '../qa/workspace-fixture.mjs';
import {genderLabel} from '../src/services/guestGender.js';

test('gender labels distinguish missing values from a decision not to share',()=>{
 assert.equal(genderLabel(null),'Not provided');assert.equal(genderLabel('PREFER_NOT_TO_SAY'),'Prefer not to say');assert.equal(genderLabel('NON_BINARY'),'Non-binary / another gender');assert.equal(genderLabel('OTHER'),'Other / unspecified');
});
test('check-in gender is validated, person-scoped, preserved in the register and synced on late linking',async()=>{
 const db=await createWorkspaceFixture(0),guest=crypto.randomUUID(),other=crypto.randomUUID(),invitation=crypto.randomUUID(),member=crypto.randomUUID(),booking=crypto.randomUUID();
 try{
 await db.exec(`alter table guest_checkin_invitations add created_at timestamptz default now();alter table stayman_booking_members add created_at timestamptz default now();alter table stayman_reservations add source text;
 insert into stayman_guests(id,property_id,full_name,gender) values('${guest}','${property}','Contact','OTHER'),('${other}','${property}','Other member','MALE');
 insert into stayman_reservations(id,property_id,guest_id,booking_ref,status,check_in_date,check_out_date) values('${booking}','${property}','${guest}','QA','PENDING','2026-10-24','2026-10-25');
 insert into guest_checkin_invitations(id,property_id,status,details) values('${invitation}','${property}','draft','{}');
 insert into stayman_booking_members(id,property_id,reservation_id,guest_id,invitation_id) values('${member}','${property}','${booking}',null,'${invitation}');
 create function public.stayman_guest_directory_basic(p_property uuid,p_search text,p_filter text,p_checkin text,p_page integer,p_size integer,p_date_from date,p_date_to date,p_date_field text) returns jsonb language sql as $$select jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('kind','member','id','${member}','reservation_id','${booking}')),'total',1)$$;`);
 const migration=await readFile(new URL('../supabase/migrations/202610230032_guest_gender.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await assert.rejects(db.query("update guest_checkin_invitations set status='completed',details=$1 where id=$2",[{gender:'invalid'},invitation]),/gender/);
 await assert.rejects(db.query("update guest_checkin_invitations set status='completed' where id=$1",[invitation]),/gender/);
 await db.query("update guest_checkin_invitations set status='completed',completed_at=now(),details=$1 where id=$2",[{gender:'NON_BINARY'},invitation]);
 assert.equal((await db.query('select gender from stayman_guests where id=$1',[guest])).rows[0].gender,'OTHER','unlinked group member must not change the booking contact');
 const result=await rpc(db,'stayman_guest_directory',{p_property:property,p_filter:'all'});assert.equal(result.rows[0].gender,'NON_BINARY');
 await db.query('update stayman_booking_members set guest_id=$1 where id=$2',[guest,member]);
 assert.equal((await db.query('select gender from stayman_guests where id=$1',[guest])).rows[0].gender,'NON_BINARY');
 assert.equal((await db.query('select gender from stayman_guests where id=$1',[other])).rows[0].gender,'MALE');
 await db.query("update guest_checkin_invitations set details=$1 where id=$2",[{gender:'PREFER_NOT_TO_SAY'},invitation]);
 assert.equal((await db.query('select gender from stayman_guests where id=$1',[guest])).rows[0].gender,'PREFER_NOT_TO_SAY');
 await assert.rejects(db.query("update guest_checkin_invitations set details='{}' where id=$1",[invitation]),/gender/);
 await db.exec("set qa.allowed='no'");await assert.rejects(rpc(db,'stayman_guest_directory',{p_property:property}),/Staff access/);
 }finally{await db.close();}
});
