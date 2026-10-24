-- Atomically claim due events across independent Vercel instances.
-- This additive schema change does not start replay until enabled by feature flag.
alter table public.ifood_order_events
  add column if not exists processing_lease_token uuid,
  add column if not exists processing_lease_until timestamptz;

create index if not exists idx_ifood_events_lease_ready
  on public.ifood_order_events (restaurant_id, merchant_id, next_retry_at, processing_lease_until, created_at)
  where processed_at is null and dead_lettered_at is null;

create or replace function public.claim_ifood_pending_events(
  p_restaurant_id uuid,
  p_merchant_id text,
  p_batch_size integer default 10
)
returns setof public.ifood_order_events
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select e.id
    from public.ifood_order_events e
    where e.restaurant_id = p_restaurant_id
      and e.merchant_id = p_merchant_id
      and e.processed_at is null
      and e.dead_lettered_at is null
      and (e.next_retry_at is null or e.next_retry_at <= now())
      and (e.processing_lease_until is null or e.processing_lease_until <= now())
      and exists (
        select 1 from public.ifood_integrations i
        where i.restaurant_id = p_restaurant_id
          and i.merchant_id = p_merchant_id
          and i.order_sync_enabled = true
      )
    order by coalesce(e.event_created_at, e.created_at), e.id
    limit least(greatest(coalesce(p_batch_size, 1), 1), 10)
    for update of e skip locked
  )
  update public.ifood_order_events e
  set processing_lease_token = gen_random_uuid(),
      processing_lease_until = now() + interval '150 seconds',
      processing_started_at = now()
  from candidates c
  where e.id = c.id
  returning e.*;
$$;

-- No untrusted user may reserve or read payloads via this function.
revoke all on function public.claim_ifood_pending_events(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ifood_pending_events(uuid, text, integer)
  to service_role;
comment on function public.claim_ifood_pending_events(uuid, text, integer) is
  'Atomic, service-role-only claim using SKIP LOCKED. Completion checks lease ownership.';
