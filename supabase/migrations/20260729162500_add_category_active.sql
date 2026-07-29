alter table public.categories
add column if not exists is_active boolean not null default true;

comment on column public.categories.is_active is
  'Controls whether the entire category is visible in the public storefront.';
