-- ONE-OFF ADMIN OPERATION, not a migration. Run the entire file in Supabase SQL Editor.
-- Default is PREVIEW ONLY. Read cleanup-test-bookings.md before enabling deletion.
-- Requires current Stayman guest/group schema (through 041); optional newer tables are detected.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table cleanup_options(
 property_id uuid,expected_property_name text,execute_delete boolean,
 expected_preview_token text,allow_issued_test_invoices boolean) on commit drop;
insert into cleanup_options values(
 '10000000-0000-0000-0000-000000000001','Hostarica',
 false, -- CHANGE TO true only after reviewing the preview.
 '',    -- PASTE preview_token from the reviewed preview here.
 false  -- Set true ONLY if reviewed issued invoices are confirmed disposable test invoices.
);

create temporary table cleanup_guest_ids(id uuid primary key) on commit drop;
create temporary table cleanup_reservation_ids(id uuid primary key) on commit drop;
create temporary table cleanup_member_ids(id uuid primary key) on commit drop;
create temporary table cleanup_invitation_ids(id uuid primary key) on commit drop;
create temporary table cleanup_folio_ids(id uuid primary key) on commit drop;
create temporary table cleanup_all_ids(id uuid primary key) on commit drop;
create temporary table cleanup_ota_keys(channel text,booking_id text,primary key(channel,booking_id)) on commit drop;
create temporary table cleanup_rows(table_name text,row_data jsonb) on commit drop;
create temporary table cleanup_report(result jsonb) on commit drop;

create or replace function pg_temp.cleanup_matches(row_data jsonb) returns boolean
language sql stable as $$
 select exists(select 1 from pg_temp.cleanup_all_ids ids where position(ids.id::text in row_data::text)>0)
$$;

do $$
declare options record; cleanup_table text; signature text; conflicts jsonb:='[]'; storage_files jsonb:='[]';
 issued jsonb; row_count integer; pass integer; inserted integer; total_inserted integer;
 -- Children before parents. Never disable constraints/triggers or delete auth users/inventory.
 tables text[]:=array['stayman_guest_correction_history','stayman_guest_corrections',
 'stayman_admin_activity','stayman_staff_actions','stayman_billing_events','stayman_reservation_edits',
 'stayman_transfers','stayman_no_show_outbox','stayman_aiosell_events','stayman_aiosell_bookings',
 'stayman_folio_payments','stayman_folio_charges','stayman_payments','stayman_allocations',
 'stayman_booking_members','stayman_folios','stayman_reservations','guest_checkin_invitations','stayman_guests'];
begin
 select * into options from pg_temp.cleanup_options;
 perform 1 from public.stayman_properties where id=options.property_id and name=options.expected_property_name for update;
 if not found then raise exception 'Property UUID/name mismatch. Nothing deleted.';end if;
 if to_regclass('public.stayman_aiosell_connections') is not null then
  perform 1 from public.stayman_aiosell_connections where property_id=options.property_id for update;
  if options.execute_delete and exists(select 1 from public.stayman_aiosell_connections where property_id=options.property_id and lease_until>now()) then
   raise exception 'Aiosell worker is active. Wait for it to finish and preview again. Nothing deleted.';
  end if;
 end if;

 -- Match names containing the literal substring test, case-insensitively, within ONE property.
 insert into pg_temp.cleanup_guest_ids
 select g.id from public.stayman_guests g where g.property_id=options.property_id
 and (g.full_name ilike '%test%' or exists(select 1 from public.stayman_guest_corrections c where c.property_id=g.property_id and c.kind='guest' and c.entity_id=g.id and c.fields->>'full_name' ilike '%test%'));
 insert into pg_temp.cleanup_invitation_ids
 select i.id from public.guest_checkin_invitations i where i.property_id=options.property_id
 and (i.details->>'full_name' ilike '%test%' or exists(select 1 from public.stayman_guest_corrections c where c.property_id=i.property_id and c.kind='walkin' and c.entity_id=i.id and c.fields->>'full_name' ilike '%test%'));
 insert into pg_temp.cleanup_reservation_ids
 select r.id from public.stayman_reservations r where r.property_id=options.property_id and
 (r.guest_id in(select id from pg_temp.cleanup_guest_ids) or exists(
 select 1 from public.stayman_booking_members m where m.reservation_id=r.id and
 (m.display_name ilike '%test%' or m.guest_id in(select id from pg_temp.cleanup_guest_ids)
 or m.invitation_id in(select id from pg_temp.cleanup_invitation_ids)
 or exists(select 1 from public.stayman_guest_corrections c where c.property_id=r.property_id and c.kind='member' and c.entity_id=m.id and c.fields->>'full_name' ilike '%test%'))));

 -- Do not delete a mixed real/test group merely because one member matched.
 select coalesce(jsonb_agg(jsonb_build_object('booking_id',r.id,'reference',r.booking_ref,'reason','Non-test booking contact or group member; review individually.')),'[]') into conflicts
 from public.stayman_reservations r left join public.stayman_guests g on g.id=r.guest_id
 where r.id in(select id from pg_temp.cleanup_reservation_ids) and
 ((g.id is not null and g.id not in(select id from pg_temp.cleanup_guest_ids)) or exists(
 select 1 from public.stayman_booking_members m where m.reservation_id=r.id
 and m.display_name not ilike '%test%'
 and coalesce(m.guest_id in(select id from pg_temp.cleanup_guest_ids),false)=false
 and coalesce(m.invitation_id in(select id from pg_temp.cleanup_invitation_ids),false)=false
 and not exists(select 1 from public.stayman_guest_corrections c where c.property_id=r.property_id and c.kind='member' and c.entity_id=m.id and c.fields->>'full_name' ilike '%test%')));

 insert into pg_temp.cleanup_member_ids select id from public.stayman_booking_members where reservation_id in(select id from pg_temp.cleanup_reservation_ids);
 insert into pg_temp.cleanup_guest_ids
 select guest_id from public.stayman_booking_members where id in(select id from pg_temp.cleanup_member_ids) and guest_id is not null on conflict do nothing;
 insert into pg_temp.cleanup_invitation_ids
 select invitation_id from public.stayman_booking_members where id in(select id from pg_temp.cleanup_member_ids) and invitation_id is not null on conflict do nothing;
 insert into pg_temp.cleanup_folio_ids select id from public.stayman_folios where reservation_id in(select id from pg_temp.cleanup_reservation_ids);
 if exists(select 1 from public.stayman_booking_members m where m.invitation_id in(select id from pg_temp.cleanup_invitation_ids) and m.id not in(select id from pg_temp.cleanup_member_ids)) then
  conflicts:=conflicts||jsonb_build_array(jsonb_build_object('reason','Check-in invitation is shared outside the selected bookings.'));
 end if;
 if exists(select 1 from public.stayman_reservations r where r.guest_id in(select id from pg_temp.cleanup_guest_ids) and r.id not in(select id from pg_temp.cleanup_reservation_ids)) then
  conflicts:=conflicts||jsonb_build_array(jsonb_build_object('reason','A selected guest has another booking outside this selection.'));
 end if;
 if exists(select 1 from public.stayman_booking_members m where m.guest_id in(select id from pg_temp.cleanup_guest_ids) and m.id not in(select id from pg_temp.cleanup_member_ids)) then
  conflicts:=conflicts||jsonb_build_array(jsonb_build_object('reason','A selected guest belongs to another group outside this selection.'));
 end if;
 insert into pg_temp.cleanup_all_ids
 select id from pg_temp.cleanup_guest_ids union select id from pg_temp.cleanup_reservation_ids
 union select id from pg_temp.cleanup_member_ids union select id from pg_temp.cleanup_invitation_ids union select id from pg_temp.cleanup_folio_ids;

 -- Include every related OTA event fingerprint for the selected booking identifiers.
 if to_regclass('public.stayman_aiosell_bookings') is not null then
  insert into pg_temp.cleanup_ota_keys select channel,booking_id from public.stayman_aiosell_bookings
  where property_id=options.property_id and reservation_id in(select id from pg_temp.cleanup_reservation_ids) on conflict do nothing;
 end if;
 if to_regclass('public.stayman_aiosell_events') is not null then
  insert into pg_temp.cleanup_ota_keys select channel,booking_id from public.stayman_aiosell_events
  where property_id=options.property_id and payload->'guest'->>'name' ilike '%test%' on conflict do nothing;
  insert into pg_temp.cleanup_all_ids select e.id from public.stayman_aiosell_events e
  where e.property_id=options.property_id and exists(select 1 from pg_temp.cleanup_ota_keys k where k.channel=e.channel and k.booking_id=e.booking_id) on conflict do nothing;
 end if;
 if to_regclass('public.stayman_aiosell_bookings') is not null and exists(
  select 1 from public.stayman_aiosell_bookings b where b.property_id=options.property_id
  and b.reservation_id is not null and b.reservation_id not in(select id from pg_temp.cleanup_reservation_ids)
  and exists(select 1 from pg_temp.cleanup_ota_keys k where k.channel=b.channel and k.booking_id=b.booking_id)) then
  conflicts:=conflicts||jsonb_build_array(jsonb_build_object('reason','A matching OTA test event is linked to a booking outside this selection.'));
 end if;

 -- Collect row IDs to cover soft references in audit JSON and legacy folio-payment schemas.
 for pass in 1..10 loop
  total_inserted:=0;
  foreach cleanup_table in array tables loop
   if to_regclass('public.'||cleanup_table) is null then continue;end if;
   execute format('insert into pg_temp.cleanup_all_ids select (to_jsonb(t)->>''id'')::uuid from public.%I t where to_jsonb(t)->>''property_id''=$1 and pg_temp.cleanup_matches(to_jsonb(t)) and to_jsonb(t)->>''id'' is not null on conflict do nothing',cleanup_table) using options.property_id::text;
   get diagnostics inserted=row_count;total_inserted:=total_inserted+inserted;
  end loop;
  exit when total_inserted=0;
 end loop;
 foreach cleanup_table in array tables loop
  if to_regclass('public.'||cleanup_table) is null then continue;end if;
  if cleanup_table in ('stayman_aiosell_events','stayman_aiosell_bookings') then
   execute format('insert into pg_temp.cleanup_rows select $2,to_jsonb(t) from public.%I t where t.property_id=$1 and (pg_temp.cleanup_matches(to_jsonb(t)) or exists(select 1 from pg_temp.cleanup_ota_keys k where k.channel=t.channel and k.booking_id=t.booking_id))',cleanup_table) using options.property_id,cleanup_table;
  else
   execute format('insert into pg_temp.cleanup_rows select $2,to_jsonb(t) from public.%I t where to_jsonb(t)->>''property_id''=$1 and pg_temp.cleanup_matches(to_jsonb(t))',cleanup_table) using options.property_id::text,cleanup_table;
  end if;
 end loop;

 if to_regclass('storage.objects') is not null then
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''bucket'',bucket_id,''path'',name)),''[]''::jsonb) from storage.objects o where bucket_id=''guest-identities'' and exists(select 1 from pg_temp.cleanup_invitation_ids i where split_part(o.name,''/'',1)=i.id::text)' into storage_files;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',row_data->>'id','number',row_data->>'invoice_number')),'[]') into issued from pg_temp.cleanup_rows where table_name='stayman_folios' and row_data->>'status'='ISSUED';
 -- Storage manifest is excluded: removing reviewed blobs must not change the DB preview token.
 select md5(coalesce(string_agg(table_name||':'||row_data::text,E'\n' order by table_name,row_data::text),'')) into signature from pg_temp.cleanup_rows;

 if options.execute_delete then
  if options.expected_preview_token is distinct from signature or options.expected_preview_token='' then raise exception 'Preview token missing or data changed. Preview again. Nothing deleted.';end if;
  if jsonb_array_length(conflicts)>0 then raise exception 'Mixed/shared booking conflicts found. Nothing deleted. Run preview.';end if;
  if jsonb_array_length(issued)>0 and not options.allow_issued_test_invoices then raise exception 'Issued invoices selected. Review preview; explicitly allow only disposable test invoices. Nothing deleted.';end if;
  if jsonb_array_length(storage_files)>0 then raise exception 'Identity files remain. Remove exactly the previewed files using Supabase Storage API/dashboard first; never DELETE storage.objects in SQL. Nothing deleted.';end if;
  if to_regclass('public.stayman_no_show_outbox') is not null then
   if exists(select 1 from public.stayman_no_show_outbox where property_id=options.property_id and reservation_id in(select id from pg_temp.cleanup_reservation_ids) and status='SENDING') then raise exception 'A no-show delivery is in flight. Finish/review it before cleanup. Nothing deleted.';end if;
  end if;
  foreach cleanup_table in array tables loop
   if to_regclass('public.'||cleanup_table) is null then continue;end if;
   -- Match the exact full rows frozen in this transaction, not a second broad name search.
   execute format('delete from public.%I t using pg_temp.cleanup_rows selected where selected.table_name=$1 and to_jsonb(t)=selected.row_data',cleanup_table) using cleanup_table;
  end loop;
  -- Release of test allocations must queue fresh absolute inventory when automatic sync is eligible.
  if to_regclass('public.stayman_aiosell_connections') is not null then
   update public.stayman_aiosell_connections set revision=revision+1,retry_at=now(),attempts=0 where property_id=options.property_id and enabled;
  end if;
 end if;

 insert into pg_temp.cleanup_report values(jsonb_build_object(
 'mode',case when options.execute_delete then 'DELETED SELECTED TEST DATA' else 'PREVIEW ONLY - nothing deleted' end,
 'property_id',options.property_id,'property_name',options.expected_property_name,'name_match','case-insensitive substring test',
 'preview_token',signature,'conflicts',conflicts,'issued_test_invoices',issued,'identity_files_to_remove_via_storage',storage_files,
 'counts',(select coalesce(jsonb_object_agg(table_name,n),'{}') from(select table_name,count(*) n from pg_temp.cleanup_rows group by table_name) totals),
 'bookings',(select coalesce(jsonb_agg(jsonb_build_object('id',row_data->>'id','reference',row_data->>'booking_ref','status',row_data->>'status','total_paise',row_data->'total_amount','paid_paise',row_data->'paid_amount')),'[]') from pg_temp.cleanup_rows where table_name='stayman_reservations'),
 'guests',(select coalesce(jsonb_agg(jsonb_build_object('id',row_data->>'id','name',row_data->>'full_name')),'[]') from pg_temp.cleanup_rows where table_name='stayman_guests')
 ));
end $$;
select result as cleanup_report from cleanup_report;
commit;
