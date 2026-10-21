import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const property='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
try{
 await db.exec(`create table stayman_properties(id uuid,timezone text);insert into stayman_properties values('${property}','Asia/Kolkata');
 create function stayman_is_staff(uuid) returns boolean language sql as $$select $1='${property}'::uuid$$;
 create table stayman_guest_directory_rows(property_id uuid,kind text,id uuid,name text,reservation_id uuid,booking_ref text,arrival date,departure date,booking_status text,web_done boolean,search_contact text);
 insert into stayman_guest_directory_rows select '${property}','guest',gen_random_uuid(),'Guest '||n,null,'REF','2026-10-21','2026-10-24','CONFIRMED',true,'' from generate_series(1,12)n;
 insert into stayman_guest_directory_rows values('${property}','walkin',gen_random_uuid(),'Walk-in',null,null,null,null,null,false,''),('${property}','guest',gen_random_uuid(),'Later guest',null,'LATER','2026-11-01','2026-11-03','CONFIRMED',true,'');`);
 const migration=await readFile(new URL('../supabase/migrations/202610210024_guest_date_filters.sql',import.meta.url),'utf8');
 await db.exec(migration.slice(migration.indexOf('create function public.stayman_guest_directory_basic'),migration.indexOf('create function public.stayman_guest_directory(')));
 const get=async(from=null,to=null,field='arrival',page=1,p=property)=>(await db.query("select stayman_guest_directory_basic($1,'','all','all',$2,10,$3,$4,$5) result",[p,page,from,to,field])).rows[0].result;
 assert.equal((await get()).total,14);
 const first=await get('2026-10-21','2026-10-21');assert.equal(first.total,12);assert.equal(first.rows.length,10);
 assert.equal((await get('2026-10-21','2026-10-21','arrival',2)).rows.length,2);
 assert.equal((await get('2026-10-24','2026-10-24','departure')).total,12);
 assert.equal((await get(null,'2026-10-20')).total,0);
 assert.equal((await get('2026-11-01')).total,1);
 await assert.rejects(get('2026-11-01','2026-10-01'),/From date/);
 await assert.rejects(get(null,null,'invalid'),/Invalid date filter/);
 await assert.rejects(get(null,null,'arrival',1,other),/Staff access/);
 console.log('PASS guest date filtering: inclusive dates, arrival/departure, open bounds, missing dates, pagination, validation and staff access');
}finally{await db.close();}
