-- Optional deployment step AFTER migration 027 and Edge Function deployment.
-- Enable pg_cron, pg_net and Vault in the Supabase Dashboard first.
-- Create Vault secrets named stayman_project_url and stayman_aiosell_worker_secret.
-- The latter must match the AIOSELL_WORKER_SECRET Edge Function secret.
-- No secrets belong in this file. Run as database administrator.
select cron.schedule('stayman-aiosell-sync', '* * * * *', $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='stayman_project_url') || '/functions/v1/aiosell-sync',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
     (select decrypted_secret from vault.decrypted_secrets where name='stayman_aiosell_worker_secret')),
   body := '{"action":"sync"}'::jsonb,
   timeout_milliseconds := 90000
 )
 from (
   select property_id from public.stayman_aiosell_connections
   where enabled and (auto_sync or manual_pending) and (revision>synced_revision or last_synced_at is null or last_synced_at<now()-interval '12 hours')
   and retry_at<=now() and (lease_until is null or lease_until<now())
   order by retry_at limit 10
 ) pending;
$job$);
