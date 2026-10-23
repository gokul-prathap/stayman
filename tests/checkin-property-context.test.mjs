import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('public profile supplies exact property context for private links without returning guest details',async()=>{
 const db=new PGlite(),property=crypto.randomUUID(),other=crypto.randomUUID(),invitation=crypto.randomUUID(),token='a'.repeat(64);
 try{
 await db.exec(`create table stayman_properties(id uuid,name text,tagline text,logo_path text,instagram_url text,whatsapp_number text,facebook_url text);
 create table guest_checkin_invitations(id uuid,property_id uuid,token_hash text);
 create table stayman_booking_members(invitation_id uuid,property_id uuid);`);
 await db.query("insert into stayman_properties(id,name) values($1,'Same name'),($2,'Same name')",[property,other]);
 await db.query("insert into guest_checkin_invitations values($1,$2,encode(sha256(convert_to($3,'UTF8')),'hex'))",[invitation,property,token]);
 const sql=await readFile(new URL('../supabase/migrations/202610230037_checkin_property_context.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 const call=async(p,t)=>(await db.query('select stayman_guest_property.result from (select guest_property_profile($1,$2) result) stayman_guest_property',[p,t])).rows[0].result;
 const result=await call(null,token);assert.equal(result.id,property);assert.equal(result.name,'Same name');assert.equal(result.details,undefined);
 assert.equal((await call(other,null)).id,other);
 assert.equal(await call(null,'b'.repeat(64)),null);
 assert.equal(await call(null,null),null,'multiple properties require explicit context');
 }finally{await db.close();}
});
