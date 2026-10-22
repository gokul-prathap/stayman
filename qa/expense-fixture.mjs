import {readFile} from 'node:fs/promises';
import {createWorkspaceFixture} from './workspace-fixture.mjs';
import {property} from './workspace-fixture.mjs';
export async function expenseFixture(){
 const db=await createWorkspaceFixture(0);
 await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text default 'qa@example.invalid',raw_user_meta_data jsonb default '{}'); insert into auth.users(id) values('${property}'); create function auth.uid() returns uuid language sql stable as $$select '${property}'::uuid$$;
 drop table stayman_expenses; create table stayman_staff_actions(property_id uuid,entity_id uuid,action text,before_details jsonb,after_details jsonb,actor uuid);
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 create or replace function public.stayman_is_owner(p uuid) returns boolean language sql stable as $$select public.stayman_is_staff(p) and coalesce(current_setting('qa.owner',true),'yes')<>'no'$$;
 `);
 const old=await readFile(new URL('../supabase/migrations/202610110012_operations_expenses.sql',import.meta.url),'utf8');
 await db.exec(old.slice(old.indexOf('create table public.stayman_expenses'),old.indexOf('do $$')));
 const start=old.indexOf('create function public.stayman_void_expense');await db.exec(old.slice(start,old.indexOf('end $$;',start)+8));
 const migration=await readFile(new URL('../supabase/migrations/202610230031_expense_reports.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 return db;
}
