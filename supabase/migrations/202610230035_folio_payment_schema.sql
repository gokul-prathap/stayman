-- Older deployed billing tables may predate accommodation_applied.
-- Never guess how existing receipts were divided between accommodation/extras.
begin;
do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='public'
  and table_name='stayman_folio_payments' and column_name='accommodation_applied') then
  if exists(select 1 from public.stayman_folio_payments) then
   raise exception 'Existing folio payments need reconciliation before adding accommodation_applied. No data was changed. Check receipt allocation against reservation paid_amount; do not assume zero.';
  end if;
  alter table public.stayman_folio_payments add column accommodation_applied bigint not null default 0
   check(accommodation_applied>=0 and accommodation_applied<=amount);
 end if;
end $$;
notify pgrst,'reload schema';
commit;
