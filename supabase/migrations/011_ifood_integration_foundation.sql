create table if not exists public.ifood_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  merchant_id text,
  merchant_name text,
  catalog_id text,
  status text not null default 'disconnected',
  auth_type text not null default 'centralized',
  sync_mode text not null default 'ifood_to_gestor',
  catalog_sync_enabled boolean not null default true,
  order_sync_enabled boolean not null default false,
  import_images boolean not null default true,
  notes text,
  connected_at timestamptz,
  last_catalog_import_at timestamptz,
  last_catalog_export_at timestamptz,
  last_order_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ifood_category_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  ifood_category_id text not null,
  ifood_catalog_id text,
  source text not null default 'ifood',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, ifood_category_id)
);

create table if not exists public.ifood_product_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ifood_item_id text not null,
  ifood_category_id text,
  ifood_catalog_id text,
  source text not null default 'ifood',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, ifood_item_id)
);

create or replace function public.touch_ifood_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_ifood_integrations_updated_at on public.ifood_integrations;
create trigger touch_ifood_integrations_updated_at
before update on public.ifood_integrations
for each row execute function public.touch_ifood_updated_at();

drop trigger if exists touch_ifood_category_links_updated_at on public.ifood_category_links;
create trigger touch_ifood_category_links_updated_at
before update on public.ifood_category_links
for each row execute function public.touch_ifood_updated_at();

drop trigger if exists touch_ifood_product_links_updated_at on public.ifood_product_links;
create trigger touch_ifood_product_links_updated_at
before update on public.ifood_product_links
for each row execute function public.touch_ifood_updated_at();

alter table public.ifood_integrations enable row level security;
alter table public.ifood_category_links enable row level security;
alter table public.ifood_product_links enable row level security;

drop policy if exists "ifood integrations owner access" on public.ifood_integrations;
create policy "ifood integrations owner access"
on public.ifood_integrations
for all
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "ifood category links owner access" on public.ifood_category_links;
create policy "ifood category links owner access"
on public.ifood_category_links
for all
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "ifood product links owner access" on public.ifood_product_links;
create policy "ifood product links owner access"
on public.ifood_product_links
for all
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.user_id = auth.uid()
  )
);
