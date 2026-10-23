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

 await database.exec(`create role service_role;
 alter table auth.users add email text;alter table auth.users add raw_user_meta_data jsonb default '{}';
 alter table stayman_staff add role text default 'MANAGER';
 alter table stayman_properties add check_in_time time default '14:00';alter table stayman_properties add check_out_time time default '11:00';
 alter table stayman_guests add gender text default 'NOT_PROVIDED';alter table stayman_guests add nationality text default 'India';
 alter table stayman_reservations add created_at timestamptz default now()-interval '1 year';alter table stayman_reservations add source text default 'Direct Booking';alter table stayman_reservations add notes text default '';
 alter table stayman_reservations add cancellation_reason text;alter table stayman_reservations add cancelled_at timestamptz;alter table stayman_reservations add cancelled_by uuid;alter table stayman_reservations add cancelled_allocations jsonb;
 alter table stayman_allocations add status text default 'PENDING';alter table stayman_allocations add charge_paise bigint;
 alter table stayman_units add gender_policy text default 'ANY';alter table stayman_units add archived_at timestamptz;
 alter table stayman_payments add recorded_by uuid;
 create table guest_checkin_invitations(id uuid primary key,property_id uuid,details jsonb default '{}',status text default 'draft',staff_name text,completed_at timestamptz,created_at timestamptz default now());
 create table stayman_booking_members(id uuid primary key,property_id uuid,reservation_id uuid,guest_id uuid,invitation_id uuid,display_name text,created_at timestamptz default now());
 create table stayman_staff_actions(id uuid primary key default gen_random_uuid(),property_id uuid,entity_id uuid,action text,before_details jsonb,after_details jsonb,actor uuid,created_at timestamptz default now(),request_id uuid unique);
 create table stayman_aiosell_connections(property_id uuid primary key,hotel_code text,enabled boolean default true,revision bigint default 1,retry_at timestamptz default now());
 create table stayman_aiosell_bookings(property_id uuid,channel text,booking_id text,reservation_id uuid,cancelled boolean default false);
 create function stayman_is_owner(p uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.stayman_staff where property_id=p and user_id=auth.uid() and role='OWNER')$$;
 create function stayman_workspace_data(p_property uuid,p_mode text default 'window',p_from date default current_date,p_to date default current_date+30,p_reservation uuid default null,p_page integer default 1,p_size integer default 25,p_search text default '',p_filter text default 'all') returns jsonb language plpgsql security definer as $$begin if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.';end if;return jsonb_build_object('reservations',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.stayman_reservations r where property_id=p_property));end$$;
 create function stayman_finance_report(p_property uuid,p_from date,p_to date) returns jsonb language plpgsql security definer as $$begin if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.';end if;return jsonb_build_object('days',jsonb_build_array(jsonb_build_object('day',p_from,'revenue',0,'cost',0)));end$$;
 create function stayman_guest_directory(p_property uuid,p_search text default '',p_filter text default 'current',p_checkin text default 'all',p_page integer default 1,p_size integer default 10,p_date_from date default null,p_date_to date default null,p_date_field text default 'arrival') returns jsonb language plpgsql security definer as $$begin if not public.stayman_is_staff(p_property) then raise exception 'Staff access required.';end if;return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'kind','guest','reservation_id',r.id)) from public.stayman_guests g join public.stayman_reservations r on r.guest_id=g.id where r.property_id=p_property),'[]'));end$$;
 create function stayman_edit_reservation(p_reservation uuid,p_details jsonb,p_expected jsonb) returns void language plpgsql as $$begin return;end$$;
 create function stayman_rename_guest(p_property uuid,p_kind text,p_id uuid,p_name text) returns void language plpgsql as $$begin return;end$$;
 `);
 const profileMigration=await readFile(new URL('../supabase/migrations/202610110013_staff_workflows.sql',import.meta.url),'utf8');
 let start=profileMigration.indexOf('create function public.stayman_guest_profile(');await database.exec(profileMigration.slice(start,profileMigration.indexOf('end $$;',start)+7));
 await database.exec(await readFile(new URL('../supabase/migrations/202610230033_checkout_invoices.sql',import.meta.url),'utf8'));
 await database.exec('alter table public.stayman_folio_payments drop column reservation_id');
 const migrations=['202610230039_booking_policies.sql','202610230040_settlement_reporting.sql','202610230041_guest_corrections.sql','202610230042_aiosell_no_show.sql','202610230043_review_queue.sql'];
 for(const name of migrations)await database.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 for(const name of migrations)await database.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await database.exec('grant select on stayman_reservations,stayman_guests,stayman_allocations,stayman_booking_members,stayman_payments to authenticated');
 const owner=id(),unit=id();await database.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'owner@example.invalid','{\"full_name\":\"QA Owner\"}')",[owner]);await database.query("insert into stayman_staff values($1,$2,'OWNER')",[property,owner]);
 await database.query("insert into stayman_units(id,property_id,room_name,label) values($1,$2,'Private','101')",[unit,property]);
 const policy={name:'QA policy',free_hours:24,cancellation:{type:'FIXED',value:10000},no_show:{type:'FIXED',value:20000}};
 await session(owner);await rpc('stayman_save_booking_policy',[property,policy,0]);
 await assert.rejects(rpc('stayman_save_booking_policy',[property,policy,0]),/changed/);
 await session(staff);await assert.rejects(rpc('stayman_save_booking_policy',[property,policy,1]),/Owner access/);
 async function booking(paid=30000,source='Direct Booking',arrival=-1,departure=2){
  await database.exec('reset role');const rid=id();
  await database.query("insert into stayman_reservations(id,property_id,guest_id,booking_ref,total_amount,paid_amount,check_in_date,check_out_date,status,source) values($1,$2,$3,$4,100000,$5,current_date+$6::integer,current_date+$7::integer,'PENDING',$8)",[rid,property,guest,rid,paid,arrival,departure,source]);
  await database.query("insert into stayman_allocations(id,property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise) values($1,$2,$3,$4,current_date+$5::integer,current_date+$6::integer,'PENDING',100000)",[id(),property,rid,unit,arrival,departure]);
  await session(owner);return rid;
 }
 const rid=await booking();let quote=await rpc('stayman_closure_quote',[rid,'NO_SHOW',null]);assert.equal(quote.fee,20000);assert.equal(quote.policy.version,1);
 await rpc('stayman_save_booking_policy',[property,{...policy,name:'New policy',no_show:{type:'FULL',value:0}},1]);
 assert.equal((await rpc('stayman_closure_quote',[rid,'NO_SHOW',quote.notice])).fee,20000,'old booking terms must not change');
 await session(staff);quote=await rpc('stayman_closure_quote',[rid,'NO_SHOW',quote.notice]);
 const closeArgs=[rid,'NO_SHOW',quote.notice,20000,'PROPERTY','Guest did not arrive',true,quote,id()];
 await rpc('stayman_close_booking',closeArgs);await rpc('stayman_close_booking',closeArgs);
 await assert.rejects(rpc('stayman_close_booking',[...closeArgs.slice(0,3),0,...closeArgs.slice(4)]),/different/);
 let row=(await database.query('select * from stayman_reservations where id=$1',[rid])).rows[0];assert.equal(row.status,'CANCELLED');assert.equal(row.closure_kind,'NO_SHOW');assert.equal(row.paid_amount,30000);assert.equal(row.closure_fee,20000);
 assert.equal((await database.query('select count(*) n from stayman_allocations where reservation_id=$1',[rid])).rows[0].n,0);
 await assert.rejects(rpc('stayman_refund',[rid,10001,'CASH','Refund',id()]),/exceeds/);
 const refundId=id();await rpc('stayman_refund',[rid,10000,'CASH','Refund returned',refundId]);await rpc('stayman_refund',[rid,10000,'CASH','Refund returned',refundId]);
 assert.equal((await database.query('select paid_amount from stayman_reservations where id=$1',[rid])).rows[0].paid_amount,20000);
 const unknown=await booking(0,'Booking.com');quote=await rpc('stayman_closure_quote',[unknown,'NO_SHOW',null]);assert.equal(quote.fee,null);
 await session(staff);const managerQuote=await rpc('stayman_closure_quote',[unknown,'NO_SHOW',quote.notice]);await assert.rejects(rpc('stayman_close_booking',[unknown,'NO_SHOW',quote.notice,0,'PROPERTY','No saved policy',true,managerQuote,id()]),/Owner access/);
 await session(owner);
 // Unpaid fees can be collected without marking them paid when closing.
 const unpaid=await booking(0);quote=await rpc('stayman_closure_quote',[unpaid,'NO_SHOW',null]);
 await rpc('stayman_close_booking',[unpaid,'NO_SHOW',quote.notice,20000,'PROPERTY','Owner reduced fee',true,quote,id()]);
 await rpc('stayman_record_payment',[unpaid,20000,'CASH','No-show fee actually collected',id()]);
 await assert.rejects(rpc('stayman_record_payment',[unpaid,1,'CASH','Overpay',id()]),/outstanding/);
 // Fee revenue is separate from stay revenue and no-show is a closed stay.
 const finance=await rpc('stayman_finance_report',[property,new Date().toISOString().slice(0,10),new Date().toISOString().slice(0,10)]);assert.equal(finance.days[0].revenue,0);assert.ok(finance.days[0].feeRevenue>=40000);


 // Free-deadline cancellation, stale quotes, owner exceptions and first-night rules.
 const future=await booking(50000,'Direct Booking',3,5);quote=await rpc('stayman_closure_quote',[future,'CANCELLATION',null]);assert.equal(quote.fee,0);
 await assert.rejects(rpc('stayman_closure_quote',[future,'NO_SHOW',null]),/check-in time/);
 await rpc('stayman_close_booking',[future,'CANCELLATION',quote.notice,0,'PROPERTY','Guest called before the deadline',false,quote,id()]);
 assert.equal((await database.query('select paid_amount from stayman_reservations where id=$1',[future])).rows[0].paid_amount,50000,'closing never refunds automatically');
 const stale=await booking(0);quote=await rpc('stayman_closure_quote',[stale,'CANCELLATION',null]);
 await rpc('stayman_record_payment',[stale,1000,'CASH','New receipt after quote',id()]);
 await assert.rejects(rpc('stayman_close_booking',[stale,'CANCELLATION',quote.notice,quote.fee,'PROPERTY','Stale quote must stop',false,quote,id()]),/changed/);
 await session(staff);quote=await rpc('stayman_closure_quote',[stale,'CANCELLATION',null]);
 await assert.rejects(rpc('stayman_close_booking',[stale,'CANCELLATION',quote.notice,0,'PROPERTY','Manager cannot waive fee',false,quote,id()]),/Owner access/);
 await assert.rejects(rpc('stayman_closure_quote',[stale,'CANCELLATION',new Date(Date.now()-7200000).toISOString()]),/Owner access/);
 await session(owner);await rpc('stayman_save_booking_policy',[property,{...policy,cancellation:{type:'FIRST_NIGHT',value:0}},2]);
 const firstNight=await booking(10000);quote=await rpc('stayman_closure_quote',[firstNight,'CANCELLATION',null]);assert.equal(quote.fee,33333);
 await rpc('stayman_close_booking',[firstNight,'CANCELLATION',quote.notice,quote.fee,'PROPERTY','Cancelled after deadline',false,quote,id()]);
 assert.equal((await rpc('stayman_closure_quote',[firstNight,'CANCELLATION',quote.notice])).fee,33333,'archived allocations preserve first-night fee');
 const reverseBooking=await booking(10000);await database.exec('reset role');const spare=id();await database.query("insert into stayman_units(id,property_id,room_name,label) values($1,$2,'Private','202')",[spare,property]);await database.query('update stayman_allocations set unit_id=$1 where reservation_id=$2',[spare,reverseBooking]);await session(owner);
 quote=await rpc('stayman_closure_quote',[reverseBooking,'NO_SHOW',null]);await rpc('stayman_close_booking',[reverseBooking,'NO_SHOW',quote.notice,10000,'PROPERTY','Mistaken no-show to reverse',true,quote,id()]);
 await rpc('stayman_reopen_no_show',[reverseBooking,'Guest called with confirmed late arrival',10000,10000]);
 let reversed=(await database.query('select status,closure_fee,paid_amount from stayman_reservations where id=$1',[reverseBooking])).rows[0];assert.equal(reversed.status,'PENDING');assert.equal(reversed.closure_fee,0);assert.equal(reversed.paid_amount,10000);
 quote=await rpc('stayman_closure_quote',[reverseBooking,'NO_SHOW',null]);await rpc('stayman_close_booking',[reverseBooking,'NO_SHOW',quote.notice,10000,'PROPERTY','Test resold room guard',true,quote,id()]);
 await database.exec('reset role');await database.query("insert into stayman_allocations(id,property_id,reservation_id,unit_id,check_in_date,check_out_date,status,charge_paise) values($1,$2,$3,$4,current_date-1,current_date+2,'PENDING',10000)",[id(),property,stale,spare]);await session(owner);
 await assert.rejects(rpc('stayman_reopen_no_show',[reverseBooking,'Room is already resold',10000,10000]),/another booking/);
 // Historical status corrections keep dates, charges and payments intact and reject conflicts.
 const past=await booking(0,'Direct Booking',-5,-2);
 await session(staff);await assert.rejects(rpc('stayman_correct_stay_status',[past,'PAST_STAY','Reception forgot status','PENDING']),/Owner access/);
 await session(owner);await rpc('stayman_correct_stay_status',[past,'PAST_STAY','Confirmed guest stayed and departed','PENDING']);
 let pastRow=(await database.query('select * from stayman_reservations where id=$1',[past])).rows[0];assert.equal(pastRow.status,'CHECKED_OUT');assert.equal(pastRow.total_amount,100000);assert.equal(pastRow.paid_amount,0);
 const conflict=await booking(0,'Direct Booking',-6,-3);
 await assert.rejects(rpc('stayman_correct_stay_status',[conflict,'PAST_STAY','Conflict must not be bypassed','PENDING']),/Conflicting/);
 const stayed=await booking(0);await database.exec('reset role');await database.query("update stayman_reservations set status='CHECKED_IN' where id=$1",[stayed]);await session(owner);
 await assert.rejects(rpc('stayman_closure_quote',[stayed,'CANCELLATION',null]),/checkout/);
 // Owner-only personal corrections preserve submitted details and retain actor/date/history.
 await database.exec('reset role');const inv=id(),mem=id();
 await database.query("insert into guest_checkin_invitations(id,property_id,details,status,completed_at) values($1,$2,$3,'completed',now())",[inv,property,{full_name:'Original submitted name',phone:'+919876543210',email:'original@example.invalid',gender:'MALE',address:'Original address'}]);
 await database.query("insert into stayman_booking_members(id,property_id,reservation_id,guest_id,invitation_id,display_name) values($1,$2,$3,$4,$5,'Original submitted name')",[mem,property,stayed,guest,inv]);
 await session(owner);
 let context=await rpc('stayman_guest_edit_context',[property,'guest',guest]);const corrected={...context.fields,full_name:'Corrected Name',phone:'+919876543210',email:'corrected@example.invalid',gender:'MALE',nationality:'India',address:'Corrected billing address'};
 await session(staff);await assert.rejects(rpc('stayman_save_guest_correction',[property,'guest',guest,corrected,0,'Correct ID spelling']),/Owner access/);
 await session(owner);await rpc('stayman_save_guest_correction',[property,'guest',guest,corrected,0,'Correct ID spelling']);
 await assert.rejects(rpc('stayman_save_guest_correction',[property,'guest',guest,corrected,0,'Stale version']),/changed/);
 context=await rpc('stayman_guest_edit_context',[property,'member',mem]);assert.equal(context.fields.full_name,'Corrected Name');assert.equal(context.edited_by,'QA Owner');assert.ok(context.edited_at);
 await database.exec('reset role');assert.equal((await database.query('select details from guest_checkin_invitations where id=$1',[inv])).rows[0].details.full_name,'Original submitted name');
 await database.query("update stayman_units set gender_policy='MALE_ONLY' where id=$1",[unit]);await session(owner);
 await assert.rejects(rpc('stayman_save_guest_correction',[property,'guest',guest,{...corrected,gender:'FEMALE'},1,'Cannot bypass dorm rule']),/restricted dorm/);
 await database.exec('reset role');await database.query("update stayman_units set gender_policy='ANY' where id=$1",[unit]);await session(owner);
 const profile=await rpc('stayman_guest_profile',[property,'guest',guest]);assert.equal(profile.personal.fields.address,'Corrected billing address');assert.equal(profile.correction_history.length,1);
 assert.equal((await rpc('stayman_invoice_context',[stayed])).guest_address,'Corrected billing address');
 // Unlinked member correction must not change the booking contact.
 await database.exec('reset role');const otherInv=id(),otherMem=id();
 await database.query("insert into guest_checkin_invitations(id,property_id,details,status) values($1,$2,$3,'completed')",[otherInv,property,{full_name:'Another Member',phone:'+919876543210',gender:'MALE'}]);
 await database.query("insert into stayman_booking_members(id,property_id,reservation_id,invitation_id,display_name) values($1,$2,$3,$4,'Another Member')",[otherMem,property,stayed,otherInv]);await session(owner);
 const memberContext=await rpc('stayman_guest_edit_context',[property,'member',otherMem]);await rpc('stayman_save_guest_correction',[property,'member',otherMem,{...memberContext.fields,full_name:'Corrected member',gender:'PREFER_NOT_TO_SAY',nationality:'India'},0,'Correct this member only']);
 assert.equal((await rpc('stayman_guest_edit_context',[property,'guest',guest])).fields.full_name,'Corrected Name');
 // Aiosell queues only supported channels and uses a lease; uncertain acknowledgement stops for review.
 const ota=await booking(0,'Booking.com');await database.exec('reset role');
 await database.query("insert into stayman_aiosell_connections(property_id,hotel_code) values($1,'sandbox-pms')",[property]);
 await database.query("insert into stayman_aiosell_bookings values($1,'Booking.com','OTA-TEST',$2,false)",[property,ota]);await session(owner);
 quote=await rpc('stayman_closure_quote',[ota,'NO_SHOW',null]);await rpc('stayman_close_booking',[ota,'NO_SHOW',quote.notice,10000,'EXTERNAL','OTA agreed no-show fee',true,quote,id(),true]);
 let state=await rpc('stayman_no_show_sync_state',[ota]);assert.equal(state.status,'PENDING');assert.equal(state.can_send,true);
 await assert.rejects(rpc('stayman_record_payment',[ota,100,'CASH','Not property money',id()]),/property-collected/);
 await database.exec('reset role');await database.exec('set role service_role');let task=await rpc('stayman_no_show_claim',[property,ota,false]);assert.equal(task.channel,'booking.com');
 assert.equal(await rpc('stayman_no_show_claim',[property,ota,false]),null);
 await rpc('stayman_no_show_finish',[ota,task.lease,'Network timeout']);assert.equal(await rpc('stayman_no_show_claim',[property,ota,false]),null);
 await session(owner);state=await rpc('stayman_no_show_sync_state',[ota]);assert.equal(state.status,'REVIEW');assert.equal(state.needs_verification,true);
 await rpc('stayman_confirm_no_show_remote',[ota,'PROVIDER-123','Verified no-show already applied']);assert.equal((await rpc('stayman_no_show_sync_state',[ota])).status,'SENT');
 await assert.rejects(rpc('stayman_reopen_no_show',[ota,'Cannot reverse provider automatically',10000,0]),/provider/);
 await session(outsider);await assert.rejects(rpc('stayman_guest_edit_context',[property,'guest',guest]),/Staff access/);await assert.rejects(rpc('stayman_closure_quote',[rid,'NO_SHOW',null]),/Staff access/);
 await database.exec('reset role');const permissions=(await database.query("select has_function_privilege('anon','stayman_close_booking(uuid,text,timestamptz,bigint,text,text,boolean,jsonb,uuid,boolean)','execute') allowed")).rows[0];assert.equal(permissions.allowed,false);
 console.log('PASS historical correction/conflict guards, original ID preservation, owner audit, dorm restrictions, member isolation, no-show outbox leases/review and cross-property permissions');
 console.log('PASS policy snapshots, permissions, no-show settlement, refund caps, request retries, unpaid-fee receipts and separate fee reporting');
}finally{await database.close();}
