create table if not exists public.storefront_checkout_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (
    event_type in ('checkout_opened', 'step_viewed', 'checkout_abandoned', 'checkout_error', 'order_completed')
  ),
  step text not null check (step in ('cart', 'address', 'payment')),
  reason text,
  created_at timestamptz not null default now(),
  constraint storefront_checkout_events_reason_length check (char_length(reason) <= 64)
);

create index if not exists storefront_checkout_events_restaurant_created_idx
  on public.storefront_checkout_events (restaurant_id, created_at desc);

create index if not exists storefront_checkout_events_session_idx
  on public.storefront_checkout_events (session_id, created_at);

alter table public.storefront_checkout_events enable row level security;

revoke all on table public.storefront_checkout_events from anon, authenticated;
grant insert, select on table public.storefront_checkout_events to service_role;
grant select on table public.storefront_checkout_events to authenticated;

drop policy if exists "Restaurant owners can read checkout events" on public.storefront_checkout_events;
create policy "Restaurant owners can read checkout events"
  on public.storefront_checkout_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants
      where restaurants.id = storefront_checkout_events.restaurant_id
        and restaurants.user_id = (select auth.uid())
    )
  );

comment on table public.storefront_checkout_events is
  'Anonymous checkout funnel events without customer PII or cart contents.';
