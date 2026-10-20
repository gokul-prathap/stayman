// Actual PostgreSQL/PLpgSQL in WASM; synthetic users/data only, no Supabase connection.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {calculateLine,chargeTypes,emptyTax} from '../src/features/billing/billingMath.js';
const database=new PGlite();
const id=()=>randomUUID(),admin=id(),staff=id(),outsider=id(),property=id(),otherProperty=id(),reservation=id(),otherReservation=id(),revisedReservation=id(),guest=id();
let checks=0;
async function check(name,action){await action();checks++;console.log('PASS '+name);}
const rpc=async(name,args=[])=>{
 const result=await database.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);
 return result.rows[0].result;
};
async function session(user,otp=true){
 await database.exec('reset role');await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,is_anonymous:false,amr:[{method:otp?'otp':'password'}]})]);await database.exec('set role authenticated');
}
try{
 await database.exec(`
 create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.stayman_properties(id uuid primary key,name text,address text,phone text,timezone text default 'Asia/Kolkata',logo_path text);
 create table public.stayman_staff(property_id uuid,user_id uuid);
 create table public.stayman_platform_admins(user_id uuid);
 create function public.stayman_is_staff(p_property uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.stayman_staff where property_id=p_property and user_id=auth.uid())$$;
 create function public.stayman_is_platform_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.stayman_platform_admins where user_id=auth.uid()) and exists(select 1 from jsonb_array_elements(auth.jwt()->'amr') entry where entry->>'method'='otp')$$;
 create table public.stayman_guests(id uuid primary key,property_id uuid,full_name text,phone text,email text);
 create table public.stayman_reservations(id uuid primary key,property_id uuid,guest_id uuid,booking_ref text,total_amount bigint,paid_amount bigint,check_in_date date,check_out_date date,status text,unique(id,property_id));
 create table public.stayman_units(id uuid primary key,property_id uuid,room_name text,label text);
 create table public.stayman_allocations(id uuid primary key,property_id uuid,reservation_id uuid,unit_id uuid,check_in_date date,check_out_date date);
 create table public.stayman_payments(id uuid primary key default gen_random_uuid(),property_id uuid,reservation_id uuid,amount_paise bigint,method text,note text,kind text default 'RECEIPT',paid_at timestamptz default now(),request_id uuid unique);
 create function public.stayman_record_payment(p_reservation uuid,p_amount bigint,p_method text,p_note text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare r public.stayman_reservations; result uuid;
 begin
 select * into r from public.stayman_reservations where id=p_reservation for update;
 if not public.stayman_is_staff(r.property_id) then raise exception 'Staff access required.';end if;
 select id into result from public.stayman_payments where request_id=p_request;
 if found then return result;end if;
 if p_amount is null or p_amount<=0 or p_amount>r.total_amount-r.paid_amount then raise exception 'Invalid accommodation payment.';end if;
 insert into public.stayman_payments(property_id,reservation_id,amount_paise,method,note,request_id) values(r.property_id,r.id,p_amount,p_method,p_note,p_request) returning id into result;
 update public.stayman_reservations set paid_amount=paid_amount+p_amount where id=r.id;return result;
 end $$;
 `);
 for(const user of [admin,staff,outsider])await database.query('insert into auth.users values($1)',[user]);
 await database.query('insert into stayman_properties(id,name,address,phone) values($1,$2,$3,$4),($5,$6,$3,$4)',[property,'Sample Stay','Sample Address','1234567890',otherProperty,'Other Stay']);
 await database.query('insert into stayman_staff values($1,$2)',[property,staff]);await database.query('insert into stayman_platform_admins values($1)',[admin]);
 await database.query('insert into stayman_guests values($1,$2,$3,$4,$5)',[guest,property,'SAMPLE PERSON','1234567890','sample@example.invalid']);
 for(const [rid,pid] of [[reservation,property],[otherReservation,otherProperty],[revisedReservation,property]])await database.query("insert into stayman_reservations values($1,$2,$3,'SAMPLE-BOOKING',74900,0,'2026-10-18','2026-10-19','CHECKED_IN')",[rid,pid,guest]);
 await database.exec(await readFile(new URL('../supabase/migrations/202610190018_billing_drafts.sql',import.meta.url),'utf8'));
 await check('migration applies without SQL errors',async()=>{});
 await session(staff);
 await check('cross-property folio access is denied',()=>assert.rejects(rpc('stayman_folio_preview',[otherReservation]),/Property access/));
 await check('staff cannot edit tax configuration',()=>assert.rejects(rpc('stayman_save_billing_profile',[property,{}]),/administrator/));
 await check('staff cannot edit property settings or write/delete billing tables directly',async()=>{
  await assert.rejects(rpc('stayman_save_settings',[property,{}]),/administrator/);
  await assert.rejects(database.exec('delete from stayman_folios'),/permission denied/);
  await assert.rejects(database.query('insert into stayman_billing_profiles(property_id) values($1)',[property]),/permission denied/);
 });
 const request=id(),chargeArgs=[reservation,'TOWEL','Towel',2,1000,'Two towels',request];
 const charge=await rpc('stayman_add_folio_charge',chargeArgs);
 await check('charge retry is idempotent and changed request payload is rejected',async()=>{
  assert.equal(await rpc('stayman_add_folio_charge',chargeArgs),charge);
  await assert.rejects(rpc('stayman_add_folio_charge',[reservation,'TOWEL','Towel',3,1000,'Two towels',request]),/different/);
 });
 await check('penalties require a reason',()=>assert.rejects(rpc('stayman_add_folio_charge',[reservation,'LOCK_PENALTY','Lost lock',1,2000,'',id()]),/Explain/));
 await rpc('stayman_add_folio_charge',[reservation,'EARLY_CHECKIN','Early check-in',1,5000,'Arrived early',id()]);
 const voidId=await rpc('stayman_add_folio_charge',[reservation,'OTHER','Mistaken charge',1,900,'',id()]);
 await rpc('stayman_void_folio_charge',[voidId,'Entered by mistake']);
 await check('voided charges are retained but excluded from draft totals',async()=>{
  const preview=await rpc('stayman_folio_preview',[reservation]);assert.equal(preview.total,81900);assert.equal(preview.lines.length,3);assert.equal(preview.settings.registration,'UNCONFIGURED');
  const data=await database.query('select voided_at from stayman_folio_charges where id=$1',[voidId]);assert.ok(data.rows[0].voided_at);
 });
 const folio=await rpc('stayman_prepare_folio',[reservation,{name:'SAMPLE PERSON',address:'Sample billing address',gstin:''}]);
 await check('submitted drafts are locked against staff charge edits',()=>assert.rejects(rpc('stayman_add_folio_charge',[reservation,'SOAP','Soap',1,500,'',id()]),/submitted or issued/));
 await check('staff cannot issue or return submitted invoices',async()=>{
  await assert.rejects(rpc('stayman_issue_folio',[folio,{}]),/administrator/);await assert.rejects(rpc('stayman_return_folio',[folio,'Correction']),/administrator/);
 });
 await session(admin,false);
 await check('password-only platform admin session is denied',()=>assert.rejects(rpc('stayman_admin_folio_queue'),/administrator/));
 await session(admin);
 await check('unconfigured registration cannot produce an issued invoice',()=>assert.rejects(rpc('stayman_issue_folio',[folio,{}]),/registration/));
 const config={registration:'NOT_REGISTERED',price_mode:'INCLUSIVE',invoice_prefix:'TEST',legal_name:'Sample Legal Stay',billing_address:'Sample Address',email:'billing@example.invalid',gstin:'',catalog:Object.fromEntries([['ACCOMMODATION'],...chargeTypes].map(([key])=>[key,emptyTax()]))};
 await rpc('stayman_save_billing_profile',[property,config]);
 let preview=await rpc('stayman_folio_preview',[reservation]);
 const number=await rpc('stayman_issue_folio',[folio,preview]);
 await check('admin issuance produces a unique bounded invoice number and freezes the snapshot',async()=>{
  assert.ok(number.length<=16);assert.match(number,/TEST\/\d{4}\/000001/);
  await rpc('stayman_save_billing_profile',[property,{...config,legal_name:'New legal name'}]);
  const issued=await rpc('stayman_folio_preview',[reservation]);assert.equal(issued.settings.legal_name,'Sample Legal Stay');assert.equal(issued.status,'ISSUED');assert.equal(issued.total,81900);
 });
 await check('issued invoice cannot be deleted or booking charges silently changed',async()=>{
  await assert.rejects(database.exec('delete from stayman_folios'),/permission denied/);
  await database.exec('reset role');await assert.rejects(database.query('update stayman_reservations set total_amount=100 where id=$1',[reservation]),/issued invoice/);await database.exec('set role authenticated');
 });
 await session(staff);
 const paymentRequest=id(),paymentArgs=[folio,10000,'CASH','Collected at desk',paymentRequest];
 await rpc('stayman_record_folio_payment',paymentArgs);
 await check('folio receipt retries do not double-record or double-apply accommodation payment',async()=>{
  await rpc('stayman_record_folio_payment',paymentArgs);
  const value=await rpc('stayman_folio_preview',[reservation]);assert.equal(value.net_paid,10000);assert.equal(value.balance,71900);
 });
 await rpc('stayman_record_payment',[reservation,64900,'UPI','Accommodation settled',id()]);
 await rpc('stayman_record_folio_payment',[folio,7000,'CASH','Amenities settled',id()]);
 await check('mixed accommodation/folio receipts reconcile and overpayment is rejected',async()=>{
  const value=await rpc('stayman_folio_preview',[reservation]);assert.equal(value.net_paid,81900);assert.equal(value.balance,0);assert.equal(value.payments.reduce((sum,p)=>sum+Number(p.amount),0),81900);
  await assert.rejects(rpc('stayman_record_folio_payment',[folio,1,'CASH','Too much',id()]),/balance/);
  await assert.rejects(rpc('stayman_record_payment',[reservation,1,'CASH','Too much',id()]),/balance/);
 });
 const revisedFolio=await rpc('stayman_prepare_folio',[revisedReservation,{name:'SAMPLE PERSON',address:'Sample billing address',gstin:''}]);
 await database.exec('reset role');await database.query('update stayman_reservations set total_amount=75000 where id=$1',[revisedReservation]);
 await session(admin);
 await check('booking changes after submission require return and fresh preparation',async()=>{
  const current=await rpc('stayman_folio_preview',[revisedReservation]);
  await assert.rejects(rpc('stayman_issue_folio',[revisedFolio,current]),/booking changed/);
  await rpc('stayman_return_folio',[revisedFolio,'Recheck revised accommodation charge']);
 });
 await session(staff);
 await check('returned drafts expose the correction reason to staff',async()=>{
  const current=await rpc('stayman_folio_preview',[revisedReservation]);assert.equal(current.status,'DRAFT');assert.match(current.review_note,/Recheck revised/);
 });
 await rpc('stayman_prepare_folio',[revisedReservation,{name:'SAMPLE PERSON',address:'Sample billing address',gstin:''}]);
 await session(admin);
 await check('stale approval snapshots are rejected and the next invoice number is unique',async()=>{
  const current=await rpc('stayman_folio_preview',[revisedReservation]);
  await assert.rejects(rpc('stayman_issue_folio',[revisedFolio,{...current,total:1}]),/changed/);
  const second=await rpc('stayman_issue_folio',[revisedFolio,current]);assert.notEqual(second,number);assert.match(second,/000002$/);
 });
 await database.exec('reset role');
 await check('SQL/JavaScript tax calculations agree including one-paisa inclusive reconciliation',async()=>{
  for(const [amount,rate,mode] of [[78645,{cgst_bps:250,sgst_bps:250},'INCLUSIVE'],[74900,{cgst_bps:250,sgst_bps:250},'EXCLUSIVE'],[12345,{igst_bps:1800},'INCLUSIVE'],[500,{},'EXCLUSIVE']]){
   const sql=await rpc('stayman_calculate_bill_line',[amount,rate,mode]),js=calculateLine(amount,rate,mode);
   for(const [key,value] of Object.entries(js))assert.equal(sql[key],value,key);
  }
 });
 await session(outsider);
 await check('unassigned account cannot read another property billing data via RLS',async()=>{
  const data=await database.query('select * from stayman_folios');assert.equal(data.rows.length,0);
  await assert.rejects(rpc('stayman_folio_preview',[reservation]),/Property access/);
 });
 console.log(`${checks} billing database checks passed.`);
}finally{await database.close();}
