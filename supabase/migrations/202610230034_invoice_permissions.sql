-- Repair authenticated RPC permissions after checkout invoice rollout.
-- Keep property authorization inside the SECURITY DEFINER functions.
begin;
revoke all on function public.stayman_invoice_context(uuid),
 public.stayman_checkout_guests(uuid,uuid[],boolean) from public,anon;
grant execute on function public.stayman_invoice_context(uuid),
 public.stayman_checkout_guests(uuid,uuid[],boolean),
 public.stayman_folio_preview(uuid),
 public.stayman_prepare_folio(uuid,jsonb),
 public.stayman_issue_folio(uuid,jsonb),
 public.stayman_record_folio_payment(uuid,bigint,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
