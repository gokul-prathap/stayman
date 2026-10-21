import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),property='00000000-0000-0000-0000-000000000001',block='00000000-0000-0000-0000-000000000002',actor='00000000-0000-0000-0000-000000000003';
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
 create function stayman_is_staff(uuid) returns boolean language sql as $$select coalesce(current_setting('test.staff',true),'yes')<>'no'$$;
 create table stayman_allocations(id uuid primary key,property_id uuid,unit_id uuid,check_in_date date,check_out_date date,status text,reason text,charge_paise bigint,
 exclude using gist(daterange(check_in_date,check_out_date,'[)') with &&));
 create table stayman_staff_actions(property_id uuid,entity_id uuid,action text,before_details jsonb,after_details jsonb,actor uuid);
 insert into stayman_allocations values('${block}','${property}','${property}','2026-10-21','2026-10-23','MAINTENANCE','Repairs',0);`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610210025_extend_maintenance.sql',import.meta.url),'utf8'));
 const extend=(expected,to)=>db.query('select stayman_extend_maintenance($1,$2,$3)',[block,expected,to]);
 await extend('2026-10-23','2026-10-25');
 assert.equal((await db.query('select count(*)::int n from stayman_allocations')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from stayman_staff_actions')).rows[0].n,1);
 await assert.rejects(extend('2026-10-23','2026-10-26'),/changed/);
 await assert.rejects(extend('2026-10-25','2026-10-25'),/later/);
 await assert.rejects(extend('2026-10-25','2028-10-25'),/366/);
 await db.exec(`insert into stayman_allocations values(gen_random_uuid(),'${property}','${property}','2026-10-26','2026-10-28','CONFIRMED',null,0)`);
 await assert.rejects(extend('2026-10-25','2026-10-27'),/exclusion constraint/);
 assert.equal((await db.query('select count(*)::int n from stayman_staff_actions')).rows[0].n,1);
 await db.exec("set test.staff='no'");await assert.rejects(extend('2026-10-25','2026-10-26'),/staff access/);
 await db.exec('set role anon');await assert.rejects(extend('2026-10-25','2026-10-26'),/permission denied/);
 console.log('PASS maintenance extension: updates one block, audit history, stale dates, range limits, atomic overlap rejection and access control');
}finally{await db.close();}
