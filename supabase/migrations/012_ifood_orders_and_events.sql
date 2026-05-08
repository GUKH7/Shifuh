alter table public.orders
  add column if not exists external_source text,
  add column if not exists external_order_id text,
  add column if not exists external_display_id text,
  add column if not exists is_test boolean not null default false,
  add column if not exists external_payload jsonb;

create unique index if not exists idx_orders_restaurant_external_order
  on public.orders (restaurant_id, external_order_id)
  where external_order_id is not null;

create table if not exists public.ifood_order_events (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  local_order_id uuid references public.orders (id) on delete set null,
  ifood_event_id text not null,
  ifood_order_id text not null,
  merchant_id text not null,
  event_code text not null,
  event_full_code text,
  event_group text,
  event_created_at timestamptz,
  acknowledged_at timestamptz,
  processed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_ifood_order_events_unique
  on public.ifood_order_events (restaurant_id, ifood_event_id);

create index if not exists idx_ifood_order_events_order
  on public.ifood_order_events (restaurant_id, ifood_order_id);

create table if not exists public.ifood_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  sync_type text not null check (sync_type in ('catalog_import', 'catalog_export', 'orders_polling', 'webhook_reconciliation')),
  status text not null check (status in ('running', 'success', 'error')),
  events_received integer not null default 0,
  events_processed integer not null default 0,
  events_acknowledged integer not null default 0,
  summary text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ifood_sync_runs_restaurant
  on public.ifood_sync_runs (restaurant_id, created_at desc);

alter table public.ifood_order_events enable row level security;
alter table public.ifood_sync_runs enable row level security;

drop policy if exists "Owners can manage own ifood order events" on public.ifood_order_events;
create policy "Owners can manage own ifood order events"
  on public.ifood_order_events for all
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "Owners can manage own ifood sync runs" on public.ifood_sync_runs;
create policy "Owners can manage own ifood sync runs"
  on public.ifood_sync_runs for all
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id and r.user_id = auth.uid()
    )
  );

drop trigger if exists ifood_order_events_updated_at on public.ifood_order_events;
create trigger ifood_order_events_updated_at
  before update on public.ifood_order_events
  for each row execute function public.set_updated_at();

drop trigger if exists ifood_sync_runs_updated_at on public.ifood_sync_runs;
create trigger ifood_sync_runs_updated_at
  before update on public.ifood_sync_runs
  for each row execute function public.set_updated_at();
