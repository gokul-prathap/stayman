import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const property='00000000-0000-0000-0000-000000000001';
export async function createWorkspaceFixture(count=100){
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated;
 create table stayman_properties(id uuid primary key,name text,timezone text);
 create table stayman_units(id uuid primary key,property_id uuid,room_name text,label text,unit_type text,gender_policy text,nightly_rate_paise bigint,archived_at timestamptz);
 create table stayman_guests(id uuid primary key,property_id uuid,full_name text,phone text,email text,gender text,nationality text,created_at timestamptz);
 create table stayman_reservations(id uuid primary key,property_id uuid,guest_id uuid,booking_ref text,status text,check_in_date date,check_out_date date,total_amount bigint,paid_amount bigint,created_at timestamptz,cancelled_at timestamptz,cancellation_reason text);
 create table stayman_allocations(id uuid primary key,property_id uuid,reservation_id uuid,unit_id uuid,check_in_date date,check_out_date date,status text,charge_paise bigint,reason text);
 create table stayman_payments(id uuid,property_id uuid,reservation_id uuid,amount_paise bigint,kind text,method text,paid_at timestamptz,note text);
 create table stayman_folios(id uuid primary key,property_id uuid,reservation_id uuid);
 -- Older deployed billing schemas have no denormalized reservation_id here.
 create table stayman_folio_payments(id uuid,property_id uuid,folio_id uuid,amount bigint,method text,paid_at timestamptz);
 create table guest_checkin_invitations(id uuid primary key,property_id uuid,source text,status text,details jsonb,completed_at timestamptz);
 create table stayman_booking_members(id uuid primary key,property_id uuid,reservation_id uuid,guest_id uuid,display_name text,invitation_id uuid);
 create table stayman_stock_items(id uuid,property_id uuid,name text,kind text,clean numeric,dirty numeric,laundry numeric,low_stock numeric);
 create table stayman_stock_movements(id uuid,property_id uuid,created_at timestamptz);
 create table stayman_expenses(id uuid,property_id uuid,amount_paise bigint,expense_date date,paid_date date,voided_at timestamptz,created_at timestamptz,category text,units_consumed numeric);
 create function stayman_is_staff(p uuid) returns boolean language sql stable as $$select p='${property}'::uuid and current_setting('qa.allowed',true)='yes'$$;
 create function stayman_is_owner(p uuid) returns boolean language sql stable as $$select public.stayman_is_staff(p)$$;
 create function stayman_team(p uuid) returns table(user_id uuid,email text,role text) language sql as $$select '${property}'::uuid,'qa@example.invalid'::text,'OWNER'::text$$;
 create function stayman_walkins(p uuid) returns table(id uuid,details jsonb) language sql as $$select i.id,i.details from public.guest_checkin_invitations i where i.property_id=p and i.source='public_qr' and i.status='completed' and not exists(select 1 from public.stayman_booking_members m where m.invitation_id=i.id)$$;
 set qa.allowed='yes';
 insert into stayman_properties values('${property}','QA Synthetic Property','Asia/Kolkata');
 insert into stayman_units select md5('u'||i)::uuid,'${property}','Room '||(i/4),'Bed '||i,'BED','ANY',50000,null from generate_series(0,39) i;
 insert into stayman_guests select md5('g'||i)::uuid,'${property}','Synthetic Guest '||i,'+919876543210',null,'MALE','India','2026-10-01' from generate_series(0,${count-1}) i;
 insert into stayman_reservations select md5('r'||i)::uuid,'${property}',md5('g'||i)::uuid,'QA-'||i,'CHECKED_OUT','2026-09-01','2026-09-03',100000,100000,'2026-10-01',null,null from generate_series(0,${count-1}) i;
 insert into stayman_allocations select md5('a'||i)::uuid,'${property}',md5('r'||i)::uuid,md5('u'||(i%40))::uuid,'2026-09-01','2026-09-03','ASSIGNED',100000,null from generate_series(0,${count-1}) i;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/202610210026_bounded_workspace_queries.sql',import.meta.url),'utf8'));
 return db;
}
export async function rpc(db,name,args){
 const keys=Object.keys(args),values=Object.values(args);
 return (await db.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as data`,values)).rows[0].data;
}
