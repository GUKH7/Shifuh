-- Pending migration source. CI generates the migration filename with Supabase CLI.
-- Never automatically choose a winner or modify historical orders/events.
-- A production conflict must be resolved explicitly BEFORE applying this migration.
do $$
begin
  if exists (
    select 1 from public.ifood_integrations
    where merchant_id is not null
    group by lower(btrim(merchant_id))
    having count(*) > 1
  ) then
    raise exception 'Merchant iFood duplicado: regularização explícita obrigatória';
  end if;
end $$;

alter table public.ifood_integrations
  add constraint ifood_merchant_id_trimmed
  check (merchant_id is null or (merchant_id = btrim(merchant_id) and merchant_id <> ''));

create unique index ifood_integrations_merchant_unique
  on public.ifood_integrations (lower(merchant_id))
  where merchant_id is not null;
