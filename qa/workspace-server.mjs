// Local-only SQL-backed mock. No connection to Supabase or production data.
import {createServer} from 'node:http';
import {createWorkspaceFixture,rpc,property} from './workspace-fixture.mjs';
let db=await createWorkspaceFixture(100);
let queue=Promise.resolve();
createServer((req,res)=>{
 const work=async()=>{
  try{
   let input='';for await(const chunk of req)input+=chunk;
   const body=JSON.parse(input||'{}');
   if(req.url==='/reset'){await db.close();db=await createWorkspaceFixture(body.count||100);res.end('{}');return;}
   if(req.url==='/properties'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify((await db.query('select * from stayman_properties')).rows));return;}
   if(req.url==='/seed-active'){
    await db.exec(`update stayman_reservations set status='PENDING',check_in_date='2026-10-21',check_out_date='2026-10-23' where id=md5('r0')::uuid;
     update stayman_allocations set check_in_date='2026-10-21',check_out_date='2026-10-23',status='PENDING' where reservation_id=md5('r0')::uuid;`);
    res.end('{}');return;
   }
   if(req.url==='/seed-checkin'){
    const status=body.completed?'completed':'draft';
    await db.exec(`update stayman_reservations set status='PENDING',check_in_date=current_date+5,check_out_date=current_date+6 where id=md5('r0')::uuid;
     update stayman_allocations set status='PENDING',check_in_date=current_date+5,check_out_date=current_date+6 where reservation_id=md5('r0')::uuid;`);
    await db.query(`insert into guest_checkin_invitations(id,property_id,source,status,details,completed_at)
     values(md5('i0')::uuid,$1,'booking',$2,'{"full_name":"Synthetic Guest 0","document_sides":["front"],"document_screening":{"front":"document-like"}}'::jsonb,case when $2='completed' then now() else null end)
     on conflict(id) do update set status=excluded.status,completed_at=excluded.completed_at`,[property,status]);
    await db.query(`insert into stayman_booking_members(id,property_id,reservation_id,guest_id,display_name,invitation_id)
     values(md5('m0')::uuid,$1,md5('r0')::uuid,null,'Synthetic Guest 0',md5('i0')::uuid) on conflict(id) do nothing`,[property]);
    res.end('{}');return;
   }
   if(req.url==='/bind-contact'){
    const result=await db.query(`update stayman_booking_members m set guest_id=r.guest_id from stayman_reservations r
     where m.id=$1 and r.guest_id=$2 and m.reservation_id=r.id and m.property_id=r.property_id returning m.id`,[body.p_member,body.p_guest]);
    if(!result.rows.length)throw new Error('Synthetic contact link mismatch');
    res.setHeader('Content-Type','application/json');res.end('null');return;
   }
   if(req.url==='/rpc'&&['stayman_workspace_data','stayman_checkin_notifications','stayman_operations_data'].includes(body.name)){
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await rpc(db,body.name,body.args)));return;
   }
   res.statusCode=404;res.end('{}');
  }catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
 };
 queue=queue.then(work,work);
}).listen(4174,'127.0.0.1',()=>console.log('Synthetic SQL API ready on 127.0.0.1:4174'));
