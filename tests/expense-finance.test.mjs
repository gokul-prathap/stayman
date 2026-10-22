import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseFixture} from '../qa/expense-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {rpc,property} from '../qa/workspace-fixture.mjs';
import {comparisonPeriod,percentChange,csvText,categoryTotals,summarizeFinance,addMonths} from '../src/features/management/utils/expenseReports.js';

test('matching month comparisons clamp short months; custom periods use equal lengths',()=>{
 assert.deepEqual(comparisonPeriod('2026-03-01','2026-03-30'),{from:'2026-02-01',to:'2026-02-28'});
 assert.deepEqual(comparisonPeriod('2026-03-01','2026-03-31'),{from:'2026-02-01',to:'2026-02-28'});
 assert.deepEqual(comparisonPeriod('2026-02-01','2026-02-28'),{from:'2026-01-01',to:'2026-01-31'});
 assert.deepEqual(comparisonPeriod('2026-10-05','2026-10-08'),{from:'2026-10-01',to:'2026-10-04'});
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');assert.equal(percentChange(50,0),null);
});
test('CSV quotes multiline user values and prevents spreadsheet formula execution',()=>{
 const csv=csvText([['=cmd',' supplier,"name"\nnext',-10,'  +SUM(A1)']]);
 assert.match(csv,/'=cmd/);assert.match(csv,/supplier,""name""\nnext/);assert.match(csv,/"-10"/);assert.match(csv,/'  \+SUM/);
});
test('utility metrics keep kg and pieces separate and exclude non-operating purchases',()=>{
 const d={days:[{day:'2026-09-01',revenue:10000,cost:3000,receipts:5000,paid:1000,propertyOut:2000,occupied:2}],categories:[
  {day:'2026-09-01',category:'LAUNDRY',cost_kind:'OPERATING',amount:3000,bills:1,pieces:10,pieces_cost:1000,kg:2,kg_cost:2000},
  {day:'2026-09-01',category:'LAUNDRY',cost_kind:'EQUIPMENT',amount:90000,bills:1}],refunds:[]};
 const a=categoryTotals(d,'2026-09-01','2026-09-30','LAUNDRY');assert.equal(a.amount,3000);assert.equal(a.piecesCost/a.pieces,100);assert.equal(a.kgCost/a.kg,1000);
 assert.equal(summarizeFinance(d,'2026-09-01','2026-09-30').propertyCash,3000);
});

test('expense ledger supports partial payments, historical balances, reimbursements, refunds and scoped reports',async()=>{
 const db=await expenseFixture();
 try{
 const save=(details,request=crypto.randomUUID())=>rpc(db,'stayman_save_expense_v2',{p_property:property,p_details:{category:'ELECTRICITY',description:'Power',vendor:'Utility',expense_date:'2026-08-01',amount_paise:10000,paid_by:'PROPERTY',method:'UPI',...details},p_request:request});
 const pay=(id,kind,amount,day,source='PROPERTY',request=crypto.randomUUID())=>rpc(db,'stayman_expense_payment',{p_expense:id,p_kind:kind,p_amount:amount,p_day:day,p_method:'UPI',p_source:source,p_request:request});
 const list=(to)=>rpc(db,'stayman_expense_list',{p_property:property,p_from:'2026-08-01',p_to:to});
 const id=await save({initial_payment:2000,paid_date:'2026-08-01'});
 const history=await rpc(db,'stayman_expense_history',{p_expense:id});assert.equal(history.payments[0].actor_label,'qa@example.invalid');assert.equal(history.events[0].actor_label,'qa@example.invalid');
 assert.equal((await list('2026-08-31')).expenses[0].balance.paid,2000);
 const request=crypto.randomUUID();await pay(id,'PAYMENT',8000,'2026-09-01','PROPERTY',request);await pay(id,'PAYMENT',8000,'2026-09-01','PROPERTY',request);
 assert.equal((await list('2026-08-31')).expenses[0].balance.paid,2000);
 assert.equal((await list('2026-09-30')).expenses[0].balance.paid,10000);
 const aug=await rpc(db,'stayman_finance_report',{p_property:property,p_from:'2026-08-01',p_to:'2026-08-31'});assert.equal(aug.outstanding,8000);assert.equal(aug.days[0].cost,10000);assert.equal(aug.days[0].paid,2000);
 await assert.rejects(pay(id,'PAYMENT',1,'2026-09-02'),/exceeds/);
 await assert.rejects(save({}),/duplicate/);
 await pay(id,'REFUND',1000,'2026-09-02');
 const sep=await rpc(db,'stayman_finance_report',{p_property:property,p_from:'2026-09-01',p_to:'2026-09-30'});assert.equal(sep.days[1].cost,-1000);assert.equal(sep.days[1].paid,-1000);assert.equal(sep.outstanding,0);
 await db.exec(`insert into stayman_reservations(id,property_id,status,check_in_date,check_out_date,total_amount) values(md5('finance-reservation')::uuid,'${property}','CHECKED_OUT','2026-09-10','2026-09-13',10001);
 insert into stayman_allocations(id,property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise) values(gen_random_uuid(),'${property}',md5('finance-reservation')::uuid,(select id from stayman_units limit 1),'2026-09-10','2026-09-13','ASSIGNED',10001);
 insert into stayman_payments(property_id,amount_paise,kind,method,paid_at) values('${property}',1000,'RECEIPT','UPI','2026-09-01T06:00:00Z'),('${property}',99900,'RECEIPT','OPENING','2026-09-01T06:00:00Z');
 insert into stayman_folio_payments(property_id,amount,method,paid_at) values('${property}',500,'UPI','2026-09-01T06:00:00Z');`);
 const stays=await rpc(db,'stayman_finance_report',{p_property:property,p_from:'2026-09-01',p_to:'2026-09-30'});
 assert.equal(stays.days.reduce((s,d)=>s+d.revenue,0),10001,'nightly allocation must conserve paise');
 assert.equal(stays.days.reduce((s,d)=>s+d.receipts,0),1500,'folio receipts included, opening balances excluded');
 const staff=await save({category:'LAUNDRY',vendor:'Wash',paid_by:'STAFF',staff_name:'Synthetic Staff',amount_paise:5000,initial_payment:5000,paid_date:'2026-08-01'});
 await assert.rejects(pay(staff,'REFUND',1000,'2026-09-01','PROPERTY'),/funds paid/);
 await pay(staff,'REIMBURSEMENT',2000,'2026-09-01');
 let s=await rpc(db,'stayman_expense_totals',{p_property:property,p_from:'2026-09-01',p_to:'2026-09-30'});assert.equal(s.staffOwed,3000);assert.equal(s.paid,9000);
 await assert.rejects(pay(staff,'REIMBURSEMENT',4000,'2026-09-02'),/exceeds/);
 await save({category:'OTHER',description:'Owner funds',cost_kind:'OWNER_CONTRIBUTION',amount_paise:20000,initial_payment:20000,paid_date:'2026-08-01',allow_duplicate:true});
 const all=await rpc(db,'stayman_finance_report',{p_property:property,p_from:'2026-08-01',p_to:'2026-09-30'});assert.equal(all.days[0].cost,15000);assert.equal(all.days[0].propertyOut,-18000);
 const rows=await list('2026-09-30'),bill=rows.expenses.find(e=>e.id===id);
 await assert.rejects(rpc(db,'stayman_save_expense_v2',{p_property:property,p_expense:id,p_expected:'2000-01-01T00:00:00Z',p_reason:'Stale correction',p_request:crypto.randomUUID(),p_details:bill}),/changed/);
 await assert.rejects(save({receipt_path:`${property}/${crypto.randomUUID()}.pdf`}),/upload is missing/);
 await db.exec(`grant usage on schema storage,auth to authenticated; grant select on stayman_properties,stayman_expenses to authenticated; grant select,insert,delete on storage.objects to authenticated;
 insert into storage.objects values(gen_random_uuid(),'${property}/${crypto.randomUUID()}.pdf','expense-receipts'); set role authenticated;`);
 assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,1);
 await db.exec("set qa.allowed='no'");assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,0);
 await assert.rejects(db.exec("insert into storage.objects values(gen_random_uuid(),'ffffffff-ffff-ffff-ffff-ffffffffffff/receipt.pdf','expense-receipts')"),/row-level security/);
 await db.exec("reset role; set qa.allowed='yes'");
 const paymentCount=(await db.query('select count(*)::int as n from stayman_expense_payments')).rows[0].n;
 await db.exec(await readFile(new URL('../supabase/migrations/202610230031_expense_reports.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*)::int as n from stayman_expense_payments')).rows[0].n,paymentCount,'rerunning migration must not create duplicate legacy payments');
 await assert.rejects(rpc(db,'stayman_save_expense_v2',{p_property:property,p_expense:id,p_expected:bill.updated_at,p_reason:'Wrong amount',p_request:crypto.randomUUID(),p_details:{...bill,amount_paise:11000}}),/Paid entries/);
 await db.exec("set qa.owner='no'");
 await assert.rejects(rpc(db,'stayman_finance_report',{p_property:property,p_from:'2026-08-01',p_to:'2026-09-30'}),/Owner access/);
 await assert.rejects(save({cost_kind:'OWNER_WITHDRAWAL'}),/Only owners/);
 await db.exec("set qa.allowed='no'");await assert.rejects(list('2026-09-30'),/Staff access/);
 }finally{await db.close();}
});
