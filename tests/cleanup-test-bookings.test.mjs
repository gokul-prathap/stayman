import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkspaceFixture,property} from '../qa/workspace-fixture.mjs';
const script=await readFile(new URL('../scripts/admin/cleanup-test-bookings.sql',import.meta.url),'utf8');
const g='20000000-0000-0000-0000-000000000001',r='30000000-0000-0000-0000-000000000001',f='40000000-0000-0000-0000-000000000001',i='50000000-0000-0000-0000-000000000001';
const otherG='20000000-0000-0000-0000-000000000002',otherR='30000000-0000-0000-0000-000000000002';
async function fixture(){
 const db=await createWorkspaceFixture(0);
 await db.exec(`update stayman_properties set name='Hostarica';
 create schema storage;create table storage.objects(bucket_id text,name text);
 create table stayman_guest_corrections(property_id uuid,kind text,entity_id uuid,fields jsonb);
 create table stayman_guest_correction_history(id uuid,property_id uuid,kind text,entity_id uuid,before_fields jsonb);
 create table stayman_aiosell_connections(property_id uuid,enabled boolean,revision bigint,retry_at timestamptz,attempts integer,lease_until timestamptz);
 create table stayman_aiosell_bookings(property_id uuid,channel text,booking_id text,reservation_id uuid references stayman_reservations(id));
 create table stayman_aiosell_events(id uuid,property_id uuid,channel text,booking_id text,payload jsonb,status text);
 create table stayman_billing_events(id uuid,property_id uuid,folio_id uuid references stayman_folios(id),details jsonb);
 create table stayman_staff_actions(id uuid,property_id uuid,entity_id uuid,after_details jsonb);
 alter table stayman_folios add status text;alter table stayman_folios add invoice_number text;
 insert into stayman_aiosell_connections values('${property}',true,1,now(),0,null);
 insert into stayman_guests(id,property_id,full_name) values('${g}','${property}','Gokul TESTING'),('${otherG}','${property}','Real Guest');
 insert into stayman_reservations(id,property_id,guest_id,booking_ref,status,total_amount,paid_amount) values('${r}','${property}','${g}','TEST-BOOK','CHECKED_OUT',200000,200000),('${otherR}','${property}','${otherG}','REAL-BOOK','PENDING',100000,0);
 insert into stayman_folios values('${f}','${property}','${r}','DRAFT',null);
 insert into stayman_folio_payments values(gen_random_uuid(),'${property}','${f}',200000,'CASH',now());
 insert into stayman_payments(id,property_id,reservation_id,amount_paise) values(gen_random_uuid(),'${property}','${r}',200000);
 insert into guest_checkin_invitations(id,property_id,details,status) values('${i}','${property}','{"full_name":"test"}','completed');
 insert into stayman_booking_members(id,property_id,reservation_id,guest_id,display_name,invitation_id) values(gen_random_uuid(),'${property}','${r}','${g}','test','${i}');
 insert into stayman_aiosell_bookings values('${property}','OTA','TEST-OTA','${r}');
 insert into stayman_aiosell_events values(gen_random_uuid(),'${property}','OTA','TEST-OTA','{"guest":{"name":"Gokul Testing"}}','REVIEW');
 insert into stayman_billing_events values(gen_random_uuid(),'${property}','${f}','{}');
 insert into stayman_staff_actions values(gen_random_uuid(),'${property}','${g}',jsonb_build_object('reservation_id','${r}'));
 insert into stayman_guest_corrections values('${property}','guest','${g}','{"full_name":"Gokul TESTING"}');
 insert into stayman_guest_correction_history values(gen_random_uuid(),'${property}','guest','${g}','{}');
 insert into stayman_properties values('00000000-0000-0000-0000-000000000002','Different property','Asia/Kolkata');
 insert into stayman_guests(id,property_id,full_name) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000002','test another property');`);
 return db;
}
const scoped=script.replace('10000000-0000-0000-0000-000000000001',property);
async function preview(db){const results=await db.exec(scoped);return results.flatMap(x=>x.rows||[]).find(x=>x.cleanup_report)?.cleanup_report;}
const apply=(token,allow=false)=>scoped.replace('false, -- CHANGE TO true','true, -- CHANGE TO true').replace("'',    -- PASTE",`'${token}',    -- PASTE`).replace('false  -- Set true',`${allow}  -- Set true`);
test('cleanup previews, checks signature and removes dependents including legacy folio-only payments',async()=>{
 const db=await fixture();try{
  const report=await preview(db);assert.equal(report.mode,'PREVIEW ONLY - nothing deleted');assert.equal(report.bookings.length,1);assert.equal(report.counts.stayman_folio_payments,1);assert.deepEqual(report.conflicts,[]);
  assert.equal((await db.query('select count(*)::int n from stayman_reservations')).rows[0].n,2);
  await assert.rejects(db.exec(apply('wrong')),/Preview token/);await db.exec('rollback');
  await db.exec(apply(report.preview_token));
  for(const table of ['stayman_folios','stayman_folio_payments','stayman_payments','stayman_booking_members','guest_checkin_invitations','stayman_aiosell_bookings','stayman_aiosell_events','stayman_billing_events','stayman_staff_actions','stayman_guest_corrections','stayman_guest_correction_history'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table);
  assert.equal((await db.query('select id from stayman_reservations')).rows[0].id,otherR);
  assert.equal((await db.query('select count(*)::int n from stayman_guests')).rows[0].n,2,'real guest and other property test guest remain');
  assert.equal((await db.query('select count(*)::int n from stayman_units')).rows[0].n,40);
  assert.equal((await db.query('select revision from stayman_aiosell_connections')).rows[0].revision,2);
 }finally{await db.close();}
});
test('cleanup blocks mixed real/test groups and changed selections',async()=>{
 const db=await fixture();try{
  let report=await preview(db);
  await db.query("update stayman_guests set full_name='test changed' where id=$1",[g]);
  await assert.rejects(db.exec(apply(report.preview_token)),/Preview token/);await db.exec('rollback');
  await db.query("insert into stayman_booking_members(id,property_id,reservation_id,guest_id,display_name) values(gen_random_uuid(),$1,$2,$3,'Real Guest')",[property,r,otherG]);
  report=await preview(db);assert.ok(report.conflicts.length>0);
  await assert.rejects(db.exec(apply(report.preview_token)),/Mixed\/shared/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from stayman_reservations')).rows[0].n,2);
 }finally{await db.close();}
});
test('cleanup requires explicit issued-test-invoice handling and physical ID-file removal',async()=>{
 const db=await fixture();try{
  await db.query("update stayman_folios set status='ISSUED',invoice_number='TEST-INV'");
  await db.query("insert into storage.objects values('guest-identities',$1)",[i+'/front.jpg']);
  const report=await preview(db);assert.equal(report.issued_test_invoices.length,1);assert.equal(report.identity_files_to_remove_via_storage.length,1);
  await assert.rejects(db.exec(apply(report.preview_token)),/Issued invoices/);await db.exec('rollback');
  await assert.rejects(db.exec(apply(report.preview_token,true)),/Identity files remain/);await db.exec('rollback');
  // Synthetic storage fixture only. Production must use Storage API, never SQL object deletion.
  await db.exec('delete from storage.objects');
  await db.exec(apply(report.preview_token,true));
  assert.equal((await db.query('select count(*)::int n from stayman_folios')).rows[0].n,0);
 }finally{await db.close();}
});
