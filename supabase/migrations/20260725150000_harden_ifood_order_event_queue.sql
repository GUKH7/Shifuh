alter table public.ifood_order_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error text,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists idx_ifood_order_events_pending_queue
  on public.ifood_order_events (restaurant_id, next_retry_at, event_created_at, created_at)
  where processed_at is null and dead_lettered_at is null;

create index if not exists idx_ifood_order_events_unacknowledged
  on public.ifood_order_events (restaurant_id, processed_at)
  where processed_at is not null and acknowledged_at is null;

alter table public.ifood_sync_runs
  add column if not exists duration_ms integer,
  add column if not exists attempts integer not null default 1;

comment on column public.ifood_order_events.retry_count is
  'Quantidade de tentativas de processamento do evento bruto recebido do iFood.';
comment on column public.ifood_order_events.next_retry_at is
  'Momento a partir do qual o evento pode voltar para a fila lógica.';
comment on column public.ifood_order_events.dead_lettered_at is
  'Marca eventos retirados da fila automática após exceder a política de retentativas.';
