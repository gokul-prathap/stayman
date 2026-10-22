-- Read-only: run in Supabase SQL Editor as administrator.
-- No passwords, worker secrets or guest information are returned.

select hotel_code, enabled, revision, synced_revision,
       retry_at, lease_until, attempts, last_synced_at, last_error,
       last_sync_results->>'revision' as last_attempt_revision,
       last_sync_results->>'checkedAt' as last_attempt_at,
       last_sync_results->'stages'->'inventory'->>'status' as inventory_status,
       last_sync_results->'stages'->'rates'->>'status' as rates_status
from public.stayman_aiosell_connections;

select tgname, tgenabled
from pg_trigger
where not tgisinternal and tgname in ('aiosell_allocation_change','aiosell_unit_change');

select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');

-- Run the following separately after confirming those extensions exist.
select jobid, jobname, schedule, active
from cron.job where jobname='stayman-aiosell-sync';

select d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname='stayman-aiosell-sync'
order by d.start_time desc limit 10;

select name, length(coalesce(decrypted_secret,''))>0 as configured
from vault.decrypted_secrets
where name in ('stayman_project_url','stayman_aiosell_worker_secret');

-- cron success means an HTTP request was queued, not that sync succeeded.
-- Inspect Edge Function logs for actual sync failures; return status only here.
select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc limit 10;
