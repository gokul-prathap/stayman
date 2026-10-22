import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceFixture,property,rpc} from '../qa/workspace-fixture.mjs';
import {normalizePropertyData} from '../src/services/propertyData.js';
import {readFile} from 'node:fs/promises';

test('bounded workspace SQL preserves scoped histories, money, pagination and authorization',async()=>{
 const db=await createWorkspaceFixture(5000);
 try{
  // The fixture already applied 026. A rerun must preserve records and grants.
  await db.exec(await readFile(new URL('../supabase/migrations/202610210026_bounded_workspace_queries.sql',import.meta.url),'utf8'));
  const base={p_property:property,p_from:'2026-10-01',p_to:'2026-10-21'};
  const permissions=(await db.query("select has_function_privilege('anon','public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text)','execute') as anon,has_function_privilege('authenticated','public.stayman_workspace_data(uuid,text,date,date,uuid,integer,integer,text,text)','execute') as staff")).rows[0];
  assert.equal(permissions.anon,false);assert.equal(permissions.staff,true);
  const dashboard=await rpc(db,'stayman_workspace_data',{...base,p_mode:'dashboard'});
  assert.equal(dashboard.reservations.length,0);assert.equal(dashboard.allocations.length,0);assert.equal(dashboard.guests.length,0);
  assert.equal(dashboard.units.length,40);assert.equal(dashboard.activities.length,4);
  const list=await rpc(db,'stayman_workspace_data',{...base,p_mode:'list',p_page:2});
  assert.equal(list.total,5000);assert.equal(list.reservations.length,25);
  const first=await rpc(db,'stayman_workspace_data',{...base,p_mode:'list',p_page:1});
  assert.equal(first.reservations.some(r=>list.reservations.some(s=>s.id===r.id)),false);
  const historical=await rpc(db,'stayman_workspace_data',{...base,p_mode:'window',p_from:'2026-09-01',p_to:'2026-09-03'});
  assert.equal(historical.reservations.length,5000);
  assert.equal(normalizePropertyData(historical).allocations[0].guestName.startsWith('Synthetic Guest'),true);
  const inventory=await rpc(db,'stayman_workspace_data',{...base,p_mode:'inventory'});
  assert.equal(inventory.team[0].role,'OWNER');assert.equal(inventory.allocations.length,0);
  await db.exec(`insert into stayman_payments select md5('cash')::uuid,'${property}',md5('r0')::uuid,12000,'RECEIPT','CASH','2026-10-20 20:00:00+00','Late receipt';
   update stayman_reservations set status='CANCELLED',paid_amount=5000 where id=md5('r0')::uuid;
   insert into stayman_expenses values(md5('expense')::uuid,'${property}',9900,'2026-09-01','2026-10-21',null,now(),'OTHER',null);`);
  const updated=await rpc(db,'stayman_workspace_data',{...base,p_mode:'dashboard'});
  assert.equal(updated.payments.length,1);assert.equal(updated.pendingRefund,5000);
  await db.exec(`insert into stayman_folios values(md5('folio')::uuid,'${property}',md5('r0')::uuid);
   insert into stayman_folio_payments values(md5('folio-payment')::uuid,'${property}',md5('folio')::uuid,2300,'CASH','2026-10-21 00:00:00+00');`);
  const withFolio=await rpc(db,'stayman_workspace_data',{...base,p_mode:'dashboard'});
  assert.equal(withFolio.folio_payments[0].reservation_id,updated.payments[0].reservation_id);
  assert.equal(normalizePropertyData(withFolio).payments.find(p=>p.folio_receipt).amount_paise,2300);
  const folioDetail=await rpc(db,'stayman_workspace_data',{...base,p_mode:'reservation',p_reservation:updated.payments[0].reservation_id});
  assert.equal(folioDetail.folio_payments.length,1);
  const expenses=await rpc(db,'stayman_operations_data',{p_property:property,p_mode:'expenses',p_from:'2026-10-01',p_to:'2026-10-21'});
  assert.equal(expenses.expenses.length,0);assert.equal(expenses.summary.paid,9900);
  await db.exec(`insert into stayman_expenses select md5('e'||i)::uuid,'${property}',100,'2026-10-20',null,null,now(),'OTHER',null from generate_series(1,60) i`);
  const expensePage=await rpc(db,'stayman_operations_data',{p_property:property,p_mode:'expenses',p_from:'2026-10-01',p_to:'2026-10-21'});
  assert.equal(expensePage.total,60);assert.equal(expensePage.expenses.length,25);
  assert.equal(expensePage.summary.incurred,6000);assert.equal(expensePage.summary.unpaid,6000);
  const detail=await rpc(db,'stayman_workspace_data',{...base,p_mode:'reservation',p_reservation:first.reservations[0].id});
  assert.equal(detail.reservations.length,1);
  assert.equal(detail.allocations.length,1);
  const refunds=await rpc(db,'stayman_workspace_data',{...base,p_mode:'refunds'});
  assert.equal(refunds.reservations[0].paid_amount,5000);
  const booking=await rpc(db,'stayman_workspace_data',{...base,p_mode:'booking',p_from:'2026-09-02',p_to:'2026-09-03'});
  assert.equal(booking.reservations.length,0);assert.equal(booking.allocations.length,5000);
  await assert.rejects(rpc(db,'stayman_workspace_data',{...base,p_property:'00000000-0000-0000-0000-000000000002'}),/Staff access/);
  await db.exec("set qa.allowed='no'");
  for(const name of ['stayman_workspace_data','stayman_checkin_notifications'])await assert.rejects(rpc(db,name,{p_property:property}),/Staff access/);
 }finally{await db.close();}
});

test('notification SQL counts each booking once, caps payload and omits identity/contact details',async()=>{
 const db=await createWorkspaceFixture(150);
 try{
  await db.exec(`update stayman_reservations set status='PENDING',check_in_date=current_date,check_out_date=current_date+2;
   insert into guest_checkin_invitations select md5('i'||i)::uuid,'${property}','public_qr','completed',jsonb_build_object('full_name','Guest '||i,'phone','PRIVATE','document_screening',jsonb_build_object('back','manual-review')),now() from generate_series(0,150) i;
   insert into stayman_booking_members select md5('m'||i)::uuid,'${property}',md5('r'||i)::uuid,md5('g'||i)::uuid,'Guest '||i,md5('i'||i)::uuid from generate_series(0,149) i;`);
  const data=await rpc(db,'stayman_checkin_notifications',{p_property:property});
  assert.equal(data.count,151);assert.equal(data.due.length,100);assert.equal(data.walkins.length,1);
  assert.equal(data.due[0].needs_review,true);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);
  await db.exec("update stayman_reservations set status='CHECKED_IN'");
  const next=await rpc(db,'stayman_checkin_notifications',{p_property:property});
  assert.equal(next.count,1);assert.equal(next.due.length,0);
 }finally{await db.close();}
});
