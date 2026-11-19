-- 99Food staged ingestion ONLY. No HTTP endpoint, provider ACK, or production rollout.
-- Applied by CI exclusively against its disposable local Supabase database.
-- Publishing this migration to a real Supabase project needs separate approval.
create table public.marketplace_99food_merchants (
  merchant_id text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint marketplace_99food_merchant_valid
    check (length(merchant_id) between 1 and 160 and merchant_id = btrim(merchant_id)
      and merchant_id !~ '[[:cntrl:]]')
);

create table public.marketplace_99food_orders (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  external_order_id text not null,
  merchant_id text not null references public.marketplace_99food_merchants(merchant_id),
  status text not null check (status in ('pending','preparing','delivering','done','canceled')),
  last_occurred_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, external_order_id),
  constraint marketplace_99food_order_id_valid
    check (length(external_order_id) between 1 and 160 and external_order_id = btrim(external_order_id)
      and external_order_id !~ '[[:cntrl:]]')
);

create table public.marketplace_99food_events (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  external_event_id text not null,
  external_order_id text not null,
  merchant_id text not null,
  status text not null check (status in ('pending','preparing','delivering','done','canceled')),
  occurred_at timestamptz not null,
  outcome text not null check (outcome in ('created','updated','stale')),
  received_at timestamptz not null default now(),
  primary key (restaurant_id, external_event_id),
  foreign key (restaurant_id, external_order_id)
    references public.marketplace_99food_orders(restaurant_id, external_order_id)
    on delete cascade,
  constraint marketplace_99food_event_id_valid
    check (length(external_event_id) between 1 and 160 and external_event_id = btrim(external_event_id)
      and external_event_id !~ '[[:cntrl:]]')
);

create index marketplace_99food_events_order_idx
  on public.marketplace_99food_events (restaurant_id, external_order_id, received_at);

-- No policies: authenticated clients and anonymous visitors cannot read or write.
alter table public.marketplace_99food_merchants enable row level security;
alter table public.marketplace_99food_orders enable row level security;
alter table public.marketplace_99food_events enable row level security;

revoke all on public.marketplace_99food_merchants from public, anon, authenticated;
revoke all on public.marketplace_99food_orders from public, anon, authenticated;
revoke all on public.marketplace_99food_events from public, anon, authenticated;
grant select, insert, update, delete on public.marketplace_99food_merchants to service_role;
grant select, insert, update, delete on public.marketplace_99food_orders to service_role;
grant select, insert on public.marketplace_99food_events to service_role;

-- One serialized decision per (restaurant,order) for independent workers.
-- Event ID uniqueness additionally prevents an event being replayed for another order.
create or replace function public.ingest_99food_staged_event(
  p_restaurant_id uuid,
  p_merchant_id text,
  p_external_order_id text,
  p_external_event_id text,
  p_status text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event record;
  existing_order record;
  result text;
  current_rank integer;
  incoming_rank integer;
begin
  -- No user-controlled client may invoke the definer function.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '99Food ingestion requires service role' using errcode = '42501';
  end if;

  if p_restaurant_id is null
    or p_merchant_id is null or length(p_merchant_id) not between 1 and 160
    or p_merchant_id <> btrim(p_merchant_id) or p_merchant_id ~ '[[:cntrl:]]'
    or p_external_order_id is null or length(p_external_order_id) not between 1 and 160
    or p_external_order_id <> btrim(p_external_order_id) or p_external_order_id ~ '[[:cntrl:]]'
    or p_external_event_id is null or length(p_external_event_id) not between 1 and 160
    or p_external_event_id <> btrim(p_external_event_id) or p_external_event_id ~ '[[:cntrl:]]'
    or p_occurred_at is null or not isfinite(p_occurred_at)
    or p_status is null or p_status not in ('pending','preparing','delivering','done','canceled')
  then
    raise exception 'invalid staged 99Food event' using errcode = '22023';
  end if;

  -- Validate the trusted merchant binding even on already-seen event IDs.
  perform 1 from public.marketplace_99food_merchants m
    where m.merchant_id = p_merchant_id
      and m.restaurant_id = p_restaurant_id
      and m.enabled = true
    for share;
  if not found then
    raise exception '99Food merchant binding unavailable' using errcode = '42501';
  end if;

  -- Prevent concurrent workers from reading the same order state and racing.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_restaurant_id::text || ':' || p_external_order_id, 990099)
  );

  select e.* into existing_event
    from public.marketplace_99food_events e
   where e.restaurant_id = p_restaurant_id and e.external_event_id = p_external_event_id;

  if found then
    if existing_event.external_order_id <> p_external_order_id
       or existing_event.merchant_id <> p_merchant_id
       or existing_event.status <> p_status
       or existing_event.occurred_at <> p_occurred_at then
      raise exception 'conflicting 99Food event ID' using errcode = '23505';
    end if;
    return 'duplicate';
  end if;

  select o.* into existing_order
    from public.marketplace_99food_orders o
   where o.restaurant_id = p_restaurant_id and o.external_order_id = p_external_order_id
   for update;

  if not found then
    insert into public.marketplace_99food_orders
      (restaurant_id, external_order_id, merchant_id, status, last_occurred_at)
    values (p_restaurant_id, p_external_order_id, p_merchant_id, p_status, p_occurred_at);
    result := 'created';
  else
    if existing_order.merchant_id <> p_merchant_id then
      raise exception '99Food order belongs to another merchant' using errcode = '42501';
    end if;

    current_rank := case existing_order.status
      when 'pending' then 0 when 'preparing' then 1
      when 'delivering' then 2 when 'done' then 3 else 4 end;
    incoming_rank := case p_status
      when 'pending' then 0 when 'preparing' then 1
      when 'delivering' then 2 when 'done' then 3 else 4 end;

    if p_occurred_at < existing_order.last_occurred_at
      or existing_order.status in ('done', 'canceled')
      or (p_status <> 'canceled' and incoming_rank < current_rank) then
      result := 'stale';
    else
      update public.marketplace_99food_orders
        set status = p_status, last_occurred_at = p_occurred_at, updated_at = now()
        where restaurant_id = p_restaurant_id and external_order_id = p_external_order_id;
      result := 'updated';
    end if;
  end if;

  insert into public.marketplace_99food_events
    (restaurant_id, external_event_id, external_order_id, merchant_id, status, occurred_at, outcome)
  values (p_restaurant_id, p_external_event_id, p_external_order_id, p_merchant_id, p_status, p_occurred_at, result);

  return result;
end;
$$;

revoke all on function public.ingest_99food_staged_event(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.ingest_99food_staged_event(uuid,text,text,text,text,timestamptz)
  to service_role;

comment on function public.ingest_99food_staged_event(uuid,text,text,text,text,timestamptz) is
  'Staged 99Food fixture ingestion only. Requires separately verified provider authenticity and an enabled server-side merchant binding. Does not send ACKs or create operational orders.';
