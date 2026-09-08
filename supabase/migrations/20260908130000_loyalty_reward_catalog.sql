-- Shifuh loyalty reward catalog.
-- Reward definitions stay independent from roulette prizes and customer reward instances.
-- Points are not debited here; redemption is implemented in the next loyalty front.

create unique index if not exists products_id_restaurant_id_uidx
  on public.products (id, restaurant_id);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  program_id uuid not null,
  name text not null,
  description text,
  reward_type text not null,
  points_cost integer not null,
  percentage_value numeric(5,2),
  fixed_amount numeric(12,2),
  product_id uuid,
  minimum_order_amount numeric(12,2) not null default 0,
  reward_validity_days integer,
  max_redemptions_total integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_rewards_program_fkey
    foreign key (program_id, restaurant_id)
    references public.loyalty_programs(id, restaurant_id)
    on delete restrict,
  constraint loyalty_rewards_product_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete restrict,
  constraint loyalty_rewards_id_tenant_key unique (id, restaurant_id),
  constraint loyalty_rewards_name_check check (char_length(btrim(name)) between 3 and 80),
  constraint loyalty_rewards_description_check check (
    description is null or char_length(btrim(description)) between 1 and 240
  ),
  constraint loyalty_rewards_type_check check (
    reward_type in ('percent','fixed','free_shipping','free_product')
  ),
  constraint loyalty_rewards_points_cost_check check (points_cost > 0),
  constraint loyalty_rewards_minimum_order_check check (minimum_order_amount >= 0),
  constraint loyalty_rewards_validity_check check (
    reward_validity_days is null or reward_validity_days between 1 and 3650
  ),
  constraint loyalty_rewards_max_redemptions_check check (
    max_redemptions_total is null or max_redemptions_total > 0
  ),
  constraint loyalty_rewards_sort_order_check check (sort_order >= 0),
  constraint loyalty_rewards_value_shape_check check (
    (
      reward_type = 'percent'
      and percentage_value is not null
      and percentage_value > 0
      and percentage_value <= 100
      and fixed_amount is null
      and product_id is null
    )
    or
    (
      reward_type = 'fixed'
      and fixed_amount is not null
      and fixed_amount > 0
      and percentage_value is null
      and product_id is null
    )
    or
    (
      reward_type = 'free_shipping'
      and percentage_value is null
      and fixed_amount is null
      and product_id is null
    )
    or
    (
      reward_type = 'free_product'
      and product_id is not null
      and percentage_value is null
      and fixed_amount is null
    )
  )
);

create unique index loyalty_rewards_program_name_uidx
  on public.loyalty_rewards (program_id, lower(btrim(name)));

create index loyalty_rewards_restaurant_program_active_idx
  on public.loyalty_rewards (restaurant_id, program_id, active, sort_order, created_at);

create index loyalty_rewards_product_idx
  on public.loyalty_rewards (restaurant_id, product_id)
  where product_id is not null;

create trigger loyalty_rewards_set_updated_at
before update on public.loyalty_rewards
for each row execute function public.set_updated_at();

alter table public.loyalty_rewards enable row level security;

revoke all on table public.loyalty_rewards from public, anon, authenticated;
grant select, insert, update, delete on table public.loyalty_rewards to authenticated;
grant all on table public.loyalty_rewards to service_role;

create policy "Members manage loyalty rewards"
on public.loyalty_rewards
for all
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = loyalty_rewards.restaurant_id
      and rm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = loyalty_rewards.restaurant_id
      and rm.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.loyalty_programs lp
    where lp.id = loyalty_rewards.program_id
      and lp.restaurant_id = loyalty_rewards.restaurant_id
  )
);

comment on table public.loyalty_rewards is
  'Restaurant-scoped catalog of benefits that customers may redeem with loyalty points.';
comment on column public.loyalty_rewards.points_cost is
  'Point price of the catalog item. No balance mutation occurs when the catalog row is created or edited.';
comment on column public.loyalty_rewards.reward_validity_days is
  'Optional validity of the future customer reward instance after points are redeemed.';
comment on column public.loyalty_rewards.max_redemptions_total is
  'Optional total redemption cap enforced by the future server-side redemption flow.';
