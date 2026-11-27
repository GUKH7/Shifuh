-- Generated with Supabase CLI and versioned before any production application.
-- Ownership is permanent across ordinary disconnects and deletes; transfer is not supported.
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

-- Private, durable ownership fence. A merchant cannot be reassigned to another
-- restaurant even after its current integration is deleted or disabled.
-- No foreign key: deleting a restaurant must not erase its ownership history.
create schema if not exists ifood_private;
revoke all on schema ifood_private from public, anon, authenticated, service_role;

create table ifood_private.merchant_ownership (
  merchant_key text primary key,
  restaurant_id uuid not null
);
alter table ifood_private.merchant_ownership enable row level security;
revoke all on table ifood_private.merchant_ownership from public, anon, authenticated, service_role;

insert into ifood_private.merchant_ownership (merchant_key, restaurant_id)
select lower(merchant_id), restaurant_id
from public.ifood_integrations where merchant_id is not null;

-- Trigger-only privilege: the caller cannot read or mutate the private registry.
-- AFTER preserves the existing RLS check and upsert semantics; any exception
-- rolls back the outer integration write. No externally callable RPC.
create function ifood_private.enforce_merchant_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  reserved_owner uuid;
begin
  if tg_op = 'DELETE' then
    if old.merchant_id is not null and caller_id is not null then
      raise exception using errcode = '23505', message = 'Merchant iFood indisponível para esta loja. Revise o vínculo com o suporte.';
    end if;
    -- Privileged maintenance can remove the live binding, never its reservation.
    return old;
  end if;

  if caller_id is not null and not exists (
    select 1 from public.restaurants r
    where r.id = new.restaurant_id and r.user_id = caller_id
  ) then
    raise exception using errcode = '42501', message = 'Acesso negado ao vínculo iFood.';
  end if;

  if tg_op = 'UPDATE' then
    if old.merchant_id is not null then
      if new.restaurant_id is distinct from old.restaurant_id
         or lower(new.merchant_id) is distinct from lower(old.merchant_id) then
        raise exception using errcode = '23505', message = 'Merchant iFood indisponível para esta loja. Revise o vínculo com o suporte.';
      end if;
      -- Existing binding already reserved by backfill or a successful insert.
      return new;
    end if;
  end if;

  if new.merchant_id is null then return new; end if;

  -- The primary key arbitrates concurrent claims, including attempts after
  -- deletion of the integration. Conflict update only succeeds for the same owner.
  insert into ifood_private.merchant_ownership as ownership (merchant_key, restaurant_id)
  values (lower(new.merchant_id), new.restaurant_id)
  on conflict (merchant_key) do update
    set restaurant_id = ownership.restaurant_id
    where ownership.restaurant_id = excluded.restaurant_id
  returning restaurant_id into reserved_owner;

  if reserved_owner is distinct from new.restaurant_id then
    raise exception using errcode = '23505', message = 'Merchant iFood indisponível para esta loja. Revise o vínculo com o suporte.';
  end if;
  return new;
end;
$$;

revoke all on function ifood_private.enforce_merchant_ownership() from public, anon, authenticated, service_role;

create trigger ifood_merchant_ownership_fence
after insert or update or delete on public.ifood_integrations
for each row execute function ifood_private.enforce_merchant_ownership();
