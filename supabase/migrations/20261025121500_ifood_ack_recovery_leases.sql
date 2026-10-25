-- iFood ACK recovery leases, independent from event processing leases.
-- Additive schema; only used when IFOOD_PERSISTED_REPLAY_ENABLED=true.
alter table public.ifood_order_events
  add column if not exists ack_lease_token uuid,
  add column if not exists ack_lease_until timestamptz;

create index if not exists idx_ifood_events_ack_lease_ready
  on public.ifood_order_events
  (restaurant_id, merchant_id, processed_at, ack_lease_until)
  where processed_at is not null and acknowledged_at is null;

create or replace function public.claim_ifood_pending_acks(
  p_restaurant_id uuid,
  p_merchant_id text,
  p_batch_size integer default 100
)
returns setof public.ifood_order_events
language sql
security invoker
set search_path = ''
as $$
  with lease as materialized (
    select gen_random_uuid() as token
  ), candidates as (
    select e.id
    from public.ifood_order_events e
    where e.restaurant_id = p_restaurant_id
      and e.merchant_id = p_merchant_id
      and e.processed_at is not null
      and e.acknowledged_at is null
      and (e.ack_lease_until is null or e.ack_lease_until <= now())
      and exists (
        select 1 from public.ifood_integrations i
        where i.restaurant_id = p_restaurant_id
          and i.merchant_id = p_merchant_id
          and i.order_sync_enabled = true
      )
    order by e.processed_at, e.id
    limit least(greatest(coalesce(p_batch_size, 1), 1), 100)
    for update of e skip locked
  )
  update public.ifood_order_events e
  set ack_lease_token = (select token from lease),
      ack_lease_until = now() + interval '150 seconds'
  from candidates c
  where e.id = c.id
  returning e.*;
$$;

revoke all on function public.claim_ifood_pending_acks(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.claim_ifood_pending_acks(uuid,text,integer)
  to service_role;

comment on function public.claim_ifood_pending_acks(uuid,text,integer) is
  'Atomic, service-role-only ACK claim; one token per batch with 150s fencing. ACK transport may be at-least-once after ambiguous responses.';
