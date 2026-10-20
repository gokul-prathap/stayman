import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const admin='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002';
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text);
 create table public.stayman_platform_admins(user_id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 insert into auth.users values('${admin}','gokulprathap@rocketmail.com'),('${staff}','staff@example.test');
`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610190019_dev_admin_password.sql',import.meta.url),'utf8'));
 // A user rerunning the SQL editor script must repair/renew access, not fail on an existing table.
 await db.exec(await readFile(new URL('../supabase/migrations/202610190019_dev_admin_password.sql',import.meta.url),'utf8'));
 const allowed=async(user,method,extra={})=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,amr:[{method}],...extra})]);
  return (await db.query('select public.stayman_is_platform_admin() allowed')).rows[0].allowed;
 };
 assert.equal(await allowed(admin,'password'),true);
 assert.equal(await allowed(staff,'password'),false);
 assert.equal(await allowed(admin,'password',{is_anonymous:true}),false);
 await db.exec("update public.stayman_dev_admin_password_access set expires_at=now()-interval '1 second'");
 assert.equal(await allowed(admin,'password'),false);
 assert.equal(await allowed(admin,'otp'),true);
 await db.exec('set role authenticated');
 await assert.rejects(db.exec(`insert into public.stayman_dev_admin_password_access values('${staff}',now()+interval '7 days')`),/permission denied/);
 console.log('PASS development admin password: membership, expiry, anonymous denial, OTP fallback, and client write protection');
} finally {await db.close();}
