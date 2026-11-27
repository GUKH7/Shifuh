-- STAGED ADMIN PROCEDURE. Never a migration or automatically invoked in production.
-- Load in an explicit transaction only after separately authorized quiescence.
-- The session-local function is not an RPC. Existing ownership trigger remains active.
create table if not exists ifood_private.merchant_cutover_history (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  old_merchant text not null,
  new_merchant text not null,
  old_integration jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table ifood_private.merchant_cutover_history enable row level security;
revoke all on ifood_private.merchant_cutover_history from public, anon, authenticated, service_role;
create temporary table if not exists ifood_cutover_session (unused boolean);
create or replace function pg_temp.replace_ifood_binding(
  p_restaurant uuid, p_expected text, p_target text, p_rollback boolean default false
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.ifood_integrations%rowtype;
  v_next public.ifood_integrations%rowtype;
  v_backup jsonb;
begin
  if current_user <> 'postgres' or auth.uid() is not null then
    raise exception 'Administrative database session required' using errcode='42501';
  end if;
  if p_expected is null or p_target is null or p_target = p_expected
     or p_expected !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_target !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Exact distinct lowercase merchant UUIDs required';
  end if;
  -- Serializes replacement and concurrent claims; never relies on a check outside the transaction.
  lock table public.ifood_integrations in share row exclusive mode;
  select * into strict v_old from public.ifood_integrations
    where restaurant_id=p_restaurant for update;
  if v_old.merchant_id is distinct from p_expected or v_old.order_sync_enabled or v_old.catalog_sync_enabled then
    raise exception 'Expected suspended binding not found';
  end if;
  if not exists (select 1 from ifood_private.merchant_ownership
    where merchant_key=p_expected and restaurant_id=p_restaurant) then
    raise exception 'Existing ownership reservation missing';
  end if;
  if exists (select 1 from ifood_private.merchant_ownership
    where merchant_key=p_target and restaurant_id<>p_restaurant)
    or exists (select 1 from public.ifood_integrations where lower(merchant_id)=p_target) then
    raise exception 'Target merchant unavailable' using errcode='23505';
  end if;
  if exists (select 1 from pg_catalog.pg_constraint where contype='f' and confrelid='public.ifood_integrations'::regclass) then
    raise exception 'Foreign key dependency: review required before replacement';
  end if;
  if exists (select 1 from public.ifood_order_events e where e.restaurant_id=p_restaurant
    and e.merchant_id=p_expected and (
      e.processing_lease_until>clock_timestamp()
      or ((to_jsonb(e)->>'ack_lease_until')::timestamptz)>clock_timestamp()
    )) or exists (select 1 from public.ifood_sync_runs s where s.restaurant_id=p_restaurant
      and s.status='running' and s.updated_at>clock_timestamp()-interval '5 minutes') then
    raise exception 'Active operations or leases: wait for externally verified quiescence';
  end if;
  if p_rollback then
    -- No automatic rollback after processing any events from the current merchant.
    if exists (select 1 from public.ifood_order_events where restaurant_id=p_restaurant and merchant_id=p_expected) then
      raise exception 'Rollback requires separate reconciliation of current merchant events';
    end if;
    select old_integration into v_backup from ifood_private.merchant_cutover_history
      where restaurant_id=p_restaurant and old_merchant=p_target and new_merchant=p_expected
      order by id desc limit 1;
    if not found then raise exception 'Prior binding snapshot unavailable'; end if;
    select * into v_next from pg_catalog.jsonb_populate_record(null::public.ifood_integrations, v_backup);
  else
    v_next := v_old;
    v_next.merchant_id := p_target;
    v_next.merchant_name := null;
    v_next.catalog_id := null;
    v_next.notes := null;
    v_next.last_catalog_import_at := null;
    v_next.last_catalog_export_at := null;
    v_next.last_order_sync_at := null;
    v_next.connected_at := null;
    v_next.import_images := false;
    v_next.sync_mode := 'ifood_to_gestor';
  end if;
  v_next.order_sync_enabled := false;
  v_next.catalog_sync_enabled := false;
  v_next.status := 'configuring';
  v_next.updated_at := clock_timestamp();
  if v_next.id is distinct from v_old.id or v_next.restaurant_id is distinct from p_restaurant
     or v_next.merchant_id is distinct from p_target then raise exception 'Snapshot identity mismatch'; end if;
  insert into ifood_private.merchant_cutover_history(restaurant_id,old_merchant,new_merchant,old_integration)
    values(p_restaurant,p_expected,p_target,to_jsonb(v_old));
  delete from public.ifood_integrations where id=v_old.id;
  insert into public.ifood_integrations select (v_next).*;
  -- The existing trigger reserves the new merchant; the old reservation is never removed.
  if (select count(*) from ifood_private.merchant_ownership
      where restaurant_id=p_restaurant and merchant_key in (p_expected,p_target)) <> 2 then
    raise exception 'Ownership postcondition failed';
  end if;
  return v_next.id;
end $$;
