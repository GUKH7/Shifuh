-- Shifuh promotions / lucky wheel persistence and audit foundation.
-- Keeps tenant isolation anchored in public.restaurant_members and makes spin results append-only.

create unique index if not exists customers_id_restaurant_id_uidx
  on public.customers (id, restaurant_id);
create unique index if not exists orders_id_restaurant_id_uidx
  on public.orders (id, restaurant_id);
create unique index if not exists products_id_restaurant_id_uidx
  on public.products (id, restaurant_id);

create table public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  kind text not null default 'roulette',
  name text not null,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  distribution_mode text not null default 'probability',
  max_awards integer,
  budget_limit numeric(12,2),
  auto_pause_on_limit boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_campaigns_kind_check check (kind = 'roulette'),
  constraint promotion_campaigns_name_check check (char_length(btrim(name)) between 3 and 80),
  constraint promotion_campaigns_status_check check (status in ('draft','scheduled','active','paused','ended')),
  constraint promotion_campaigns_distribution_mode_check check (distribution_mode in ('probability','frequency')),
  constraint promotion_campaigns_dates_check check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  constraint promotion_campaigns_scheduled_dates_check check (
    status not in ('scheduled','active') or (starts_at is not null and ends_at is not null)
  ),
  constraint promotion_campaigns_max_awards_check check (max_awards is null or max_awards > 0),
  constraint promotion_campaigns_budget_check check (budget_limit is null or budget_limit > 0),
  constraint promotion_campaigns_id_restaurant_key unique (id, restaurant_id)
);

create table public.promotion_eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  campaign_id uuid not null,
  rule_type text not null,
  enabled boolean not null default true,
  threshold_amount numeric(12,2),
  threshold_count integer,
  weekdays smallint[],
  start_time time,
  end_time time,
  max_spins integer,
  limit_period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_eligibility_rules_campaign_fkey
    foreign key (campaign_id, restaurant_id)
    references public.promotion_campaigns(id, restaurant_id)
    on delete cascade,
  constraint promotion_eligibility_rules_type_check check (
    rule_type in ('completed_order','minimum_order','every_orders','spend_threshold','first_purchase','schedule','customer_spin_limit')
  ),
  constraint promotion_eligibility_rules_values_check check (
    case rule_type
      when 'minimum_order' then threshold_amount is not null and threshold_amount > 0
      when 'every_orders' then threshold_count is not null and threshold_count > 0
      when 'spend_threshold' then threshold_amount is not null and threshold_amount > 0
      when 'schedule' then coalesce(array_length(weekdays, 1), 0) > 0
        and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
        and start_time is not null and end_time is not null and end_time > start_time
      when 'customer_spin_limit' then max_spins is not null and max_spins > 0
        and limit_period in ('day','week','campaign')
      else true
    end
  ),
  constraint promotion_eligibility_rules_campaign_type_key unique (campaign_id, rule_type),
  constraint promotion_eligibility_rules_id_tenant_key unique (id, restaurant_id, campaign_id)
);

create table public.promotion_prizes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  campaign_id uuid not null,
  prize_type text not null,
  label text not null,
  percentage_value numeric(6,3),
  fixed_amount numeric(12,2),
  product_id uuid,
  probability numeric(7,4),
  frequency_every integer,
  quantity_limit integer,
  per_customer_limit integer,
  reward_validity_minutes integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_prizes_campaign_fkey
    foreign key (campaign_id, restaurant_id)
    references public.promotion_campaigns(id, restaurant_id)
    on delete cascade,
  constraint promotion_prizes_product_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete restrict,
  constraint promotion_prizes_type_check check (
    prize_type in ('percent','fixed','free_shipping','free_product','no_prize')
  ),
  constraint promotion_prizes_label_check check (char_length(btrim(label)) between 2 and 120),
  constraint promotion_prizes_value_check check (
    (prize_type = 'percent' and percentage_value is not null and percentage_value > 0 and percentage_value <= 100 and fixed_amount is null and product_id is null)
    or (prize_type = 'fixed' and fixed_amount is not null and fixed_amount > 0 and percentage_value is null and product_id is null)
    or (prize_type = 'free_shipping' and percentage_value is null and fixed_amount is null and product_id is null)
    or (prize_type = 'free_product' and product_id is not null and percentage_value is null and fixed_amount is null)
    or (prize_type = 'no_prize' and percentage_value is null and fixed_amount is null and product_id is null)
  ),
  constraint promotion_prizes_probability_check check (probability is null or (probability >= 0 and probability <= 100)),
  constraint promotion_prizes_frequency_check check (frequency_every is null or frequency_every > 0),
  constraint promotion_prizes_quantity_limit_check check (quantity_limit is null or quantity_limit > 0),
  constraint promotion_prizes_customer_limit_check check (per_customer_limit is null or per_customer_limit > 0),
  constraint promotion_prizes_limits_consistency_check check (
    quantity_limit is null or per_customer_limit is null or per_customer_limit <= quantity_limit
  ),
  constraint promotion_prizes_validity_check check (reward_validity_minutes is null or reward_validity_minutes > 0),
  constraint promotion_prizes_id_tenant_key unique (id, restaurant_id, campaign_id)
);

create table public.promotion_spins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  source_order_id uuid,
  eligibility_rule_id uuid,
  idempotency_key text not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint promotion_spins_campaign_fkey
    foreign key (campaign_id, restaurant_id)
    references public.promotion_campaigns(id, restaurant_id)
    on delete restrict,
  constraint promotion_spins_customer_fkey
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id)
    on delete restrict,
  constraint promotion_spins_order_fkey
    foreign key (source_order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint promotion_spins_rule_fkey
    foreign key (eligibility_rule_id, restaurant_id, campaign_id)
    references public.promotion_eligibility_rules(id, restaurant_id, campaign_id)
    on delete restrict,
  constraint promotion_spins_status_check check (status in ('pending','resolved','expired')),
  constraint promotion_spins_idempotency_key_check check (char_length(btrim(idempotency_key)) between 8 and 160),
  constraint promotion_spins_snapshot_check check (jsonb_typeof(eligibility_snapshot) = 'object'),
  constraint promotion_spins_resolution_check check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  ),
  constraint promotion_spins_tenant_idempotency_key unique (restaurant_id, idempotency_key),
  constraint promotion_spins_id_tenant_key unique (id, restaurant_id, campaign_id, customer_id)
);

create table public.promotion_spin_results (
  id uuid primary key default gen_random_uuid(),
  spin_id uuid not null unique references public.promotion_spins(id) on delete restrict,
  restaurant_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  prize_id uuid not null,
  prize_type text not null,
  prize_label text not null,
  percentage_value numeric(6,3),
  fixed_amount numeric(12,2),
  product_id uuid,
  reward_validity_minutes integer,
  decision_mode text not null,
  engine_version text not null default 'v1',
  decision_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint promotion_spin_results_spin_tenant_fkey
    foreign key (spin_id, restaurant_id, campaign_id, customer_id)
    references public.promotion_spins(id, restaurant_id, campaign_id, customer_id)
    on delete restrict,
  constraint promotion_spin_results_prize_fkey
    foreign key (prize_id, restaurant_id, campaign_id)
    references public.promotion_prizes(id, restaurant_id, campaign_id)
    on delete restrict,
  constraint promotion_spin_results_product_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete restrict,
  constraint promotion_spin_results_type_check check (prize_type in ('percent','fixed','free_shipping','free_product','no_prize')),
  constraint promotion_spin_results_decision_mode_check check (decision_mode in ('probability','frequency')),
  constraint promotion_spin_results_metadata_check check (jsonb_typeof(decision_metadata) = 'object'),
  constraint promotion_spin_results_id_tenant_key unique (id, restaurant_id)
);

create table public.customer_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  campaign_id uuid not null,
  customer_id uuid not null,
  spin_id uuid not null unique,
  spin_result_id uuid not null unique,
  prize_id uuid not null,
  reward_type text not null,
  label text not null,
  percentage_value numeric(6,3),
  fixed_amount numeric(12,2),
  product_id uuid,
  status text not null default 'available',
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_rewards_campaign_fkey
    foreign key (campaign_id, restaurant_id)
    references public.promotion_campaigns(id, restaurant_id)
    on delete restrict,
  constraint customer_rewards_customer_fkey
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id)
    on delete restrict,
  constraint customer_rewards_spin_fkey
    foreign key (spin_id, restaurant_id, campaign_id, customer_id)
    references public.promotion_spins(id, restaurant_id, campaign_id, customer_id)
    on delete restrict,
  constraint customer_rewards_result_fkey
    foreign key (spin_result_id, restaurant_id)
    references public.promotion_spin_results(id, restaurant_id)
    on delete restrict,
  constraint customer_rewards_prize_fkey
    foreign key (prize_id, restaurant_id, campaign_id)
    references public.promotion_prizes(id, restaurant_id, campaign_id)
    on delete restrict,
  constraint customer_rewards_product_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete restrict,
  constraint customer_rewards_redeemed_order_fkey
    foreign key (redeemed_order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint customer_rewards_type_check check (reward_type in ('percent','fixed','free_shipping','free_product')),
  constraint customer_rewards_status_check check (status in ('available','redeemed','expired','cancelled')),
  constraint customer_rewards_redemption_check check (
    (status = 'redeemed' and redeemed_at is not null and redeemed_order_id is not null)
    or (status <> 'redeemed')
  )
);

create index promotion_campaigns_restaurant_status_idx
  on public.promotion_campaigns (restaurant_id, status, starts_at, ends_at);
create index promotion_rules_restaurant_campaign_idx
  on public.promotion_eligibility_rules (restaurant_id, campaign_id, enabled);
create index promotion_prizes_restaurant_campaign_idx
  on public.promotion_prizes (restaurant_id, campaign_id, active, sort_order);
create index promotion_spins_campaign_customer_created_idx
  on public.promotion_spins (campaign_id, customer_id, created_at desc);
create index promotion_spins_restaurant_status_idx
  on public.promotion_spins (restaurant_id, status, created_at desc);
create index promotion_results_campaign_prize_idx
  on public.promotion_spin_results (campaign_id, prize_id, created_at desc);
create index promotion_results_customer_prize_idx
  on public.promotion_spin_results (customer_id, prize_id, created_at desc);
create index customer_rewards_customer_status_idx
  on public.customer_rewards (customer_id, status, created_at desc);
create index customer_rewards_restaurant_status_idx
  on public.customer_rewards (restaurant_id, status, created_at desc);

create trigger promotion_campaigns_set_updated_at
before update on public.promotion_campaigns
for each row execute function public.set_updated_at();
create trigger promotion_rules_set_updated_at
before update on public.promotion_eligibility_rules
for each row execute function public.set_updated_at();
create trigger promotion_prizes_set_updated_at
before update on public.promotion_prizes
for each row execute function public.set_updated_at();
create trigger customer_rewards_set_updated_at
before update on public.customer_rewards
for each row execute function public.set_updated_at();

create or replace function app_private.guard_promotion_spin_result_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Promotion spin results are immutable';
end;
$$;

create or replace function app_private.prepare_promotion_spin_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_spin public.promotion_spins%rowtype;
  v_prize public.promotion_prizes%rowtype;
  v_campaign public.promotion_campaigns%rowtype;
  v_awards integer;
  v_prize_awards integer;
  v_customer_prize_awards integer;
begin
  select * into v_spin
  from public.promotion_spins
  where id = new.spin_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion spin not found';
  end if;

  if v_spin.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Promotion spin is not pending';
  end if;

  select * into v_campaign
  from public.promotion_campaigns
  where id = v_spin.campaign_id
    and restaurant_id = v_spin.restaurant_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion campaign not found';
  end if;

  select * into v_prize
  from public.promotion_prizes
  where id = new.prize_id
    and restaurant_id = v_spin.restaurant_id
    and campaign_id = v_spin.campaign_id
    and active;

  if not found then
    raise exception using errcode = '23503', message = 'Active promotion prize not found for this campaign';
  end if;

  if v_prize.prize_type <> 'no_prize' then
    select count(*)::integer into v_awards
    from public.promotion_spin_results r
    where r.campaign_id = v_spin.campaign_id
      and r.prize_type <> 'no_prize';

    if v_campaign.max_awards is not null and v_awards >= v_campaign.max_awards then
      raise exception using errcode = '23514', message = 'Campaign award limit reached';
    end if;

    select count(*)::integer into v_prize_awards
    from public.promotion_spin_results r
    where r.prize_id = v_prize.id
      and r.prize_type <> 'no_prize';

    if v_prize.quantity_limit is not null and v_prize_awards >= v_prize.quantity_limit then
      raise exception using errcode = '23514', message = 'Prize quantity limit reached';
    end if;

    select count(*)::integer into v_customer_prize_awards
    from public.promotion_spin_results r
    where r.prize_id = v_prize.id
      and r.customer_id = v_spin.customer_id
      and r.prize_type <> 'no_prize';

    if v_prize.per_customer_limit is not null and v_customer_prize_awards >= v_prize.per_customer_limit then
      raise exception using errcode = '23514', message = 'Customer prize limit reached';
    end if;
  end if;

  new.restaurant_id := v_spin.restaurant_id;
  new.campaign_id := v_spin.campaign_id;
  new.customer_id := v_spin.customer_id;
  new.prize_type := v_prize.prize_type;
  new.prize_label := v_prize.label;
  new.percentage_value := v_prize.percentage_value;
  new.fixed_amount := v_prize.fixed_amount;
  new.product_id := v_prize.product_id;
  new.reward_validity_minutes := v_prize.reward_validity_minutes;
  new.decision_mode := v_campaign.distribution_mode;
  new.created_at := now();

  if jsonb_typeof(new.decision_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'Decision metadata must be a JSON object';
  end if;

  return new;
end;
$$;

create or replace function app_private.finalize_promotion_spin_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.promotion_spins
  set status = 'resolved', resolved_at = new.created_at
  where id = new.spin_id
    and status = 'pending';

  if not found then
    raise exception using errcode = '55000', message = 'Promotion spin could not be resolved';
  end if;

  if new.prize_type <> 'no_prize' then
    insert into public.customer_rewards (
      restaurant_id,
      campaign_id,
      customer_id,
      spin_id,
      spin_result_id,
      prize_id,
      reward_type,
      label,
      percentage_value,
      fixed_amount,
      product_id,
      expires_at
    ) values (
      new.restaurant_id,
      new.campaign_id,
      new.customer_id,
      new.spin_id,
      new.id,
      new.prize_id,
      new.prize_type,
      new.prize_label,
      new.percentage_value,
      new.fixed_amount,
      new.product_id,
      case
        when new.reward_validity_minutes is null then null
        else new.created_at + make_interval(mins => new.reward_validity_minutes)
      end
    );
  end if;

  return new;
end;
$$;

create trigger promotion_spin_results_prepare
before insert on public.promotion_spin_results
for each row execute function app_private.prepare_promotion_spin_result();

create trigger promotion_spin_results_finalize
after insert on public.promotion_spin_results
for each row execute function app_private.finalize_promotion_spin_result();

create trigger promotion_spin_results_immutable
before update or delete on public.promotion_spin_results
for each row execute function app_private.guard_promotion_spin_result_immutable();

revoke all on function app_private.guard_promotion_spin_result_immutable() from public, anon, authenticated;
revoke all on function app_private.prepare_promotion_spin_result() from public, anon, authenticated;
revoke all on function app_private.finalize_promotion_spin_result() from public, anon, authenticated;

alter table public.promotion_campaigns enable row level security;
alter table public.promotion_eligibility_rules enable row level security;
alter table public.promotion_prizes enable row level security;
alter table public.promotion_spins enable row level security;
alter table public.promotion_spin_results enable row level security;
alter table public.customer_rewards enable row level security;

revoke all on table public.promotion_campaigns from public, anon, authenticated;
revoke all on table public.promotion_eligibility_rules from public, anon, authenticated;
revoke all on table public.promotion_prizes from public, anon, authenticated;
revoke all on table public.promotion_spins from public, anon, authenticated;
revoke all on table public.promotion_spin_results from public, anon, authenticated;
revoke all on table public.customer_rewards from public, anon, authenticated;

grant select, insert, update, delete on table public.promotion_campaigns to authenticated;
grant select, insert, update, delete on table public.promotion_eligibility_rules to authenticated;
grant select, insert, update, delete on table public.promotion_prizes to authenticated;
grant select on table public.promotion_spins to authenticated;
grant select on table public.promotion_spin_results to authenticated;
grant select on table public.customer_rewards to authenticated;

grant all on table public.promotion_campaigns to service_role;
grant all on table public.promotion_eligibility_rules to service_role;
grant all on table public.promotion_prizes to service_role;
grant all on table public.promotion_spins to service_role;
grant all on table public.promotion_spin_results to service_role;
grant all on table public.customer_rewards to service_role;

create policy "Members manage promotion campaigns"
on public.promotion_campaigns
for all
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_campaigns.restaurant_id
      and rm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_campaigns.restaurant_id
      and rm.user_id = (select auth.uid())
  )
  and (created_by is null or created_by = (select auth.uid()))
);

create policy "Members manage promotion eligibility rules"
on public.promotion_eligibility_rules
for all
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_eligibility_rules.restaurant_id
      and rm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_eligibility_rules.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

create policy "Members manage promotion prizes"
on public.promotion_prizes
for all
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_prizes.restaurant_id
      and rm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_prizes.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

create policy "Members read promotion spins"
on public.promotion_spins
for select
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_spins.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

create policy "Members read promotion spin results"
on public.promotion_spin_results
for select
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = promotion_spin_results.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

create policy "Members read customer rewards"
on public.customer_rewards
for select
to authenticated
using (
  exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = customer_rewards.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

comment on table public.promotion_campaigns is 'Restaurant-scoped promotion campaigns. Frontend configuration is persisted here; operational outcomes are stored separately.';
comment on table public.promotion_eligibility_rules is 'Typed eligibility and spin-limit rules for a promotion campaign.';
comment on table public.promotion_prizes is 'Configured roulette outcomes and per-prize limits.';
comment on table public.promotion_spins is 'One granted/consumed spin for a restaurant customer, protected by a tenant-scoped idempotency key.';
comment on table public.promotion_spin_results is 'Immutable one-to-one outcome ledger for spins. Prize values are snapshotted at resolution time.';
comment on table public.customer_rewards is 'Redeemable customer rewards created atomically from winning spin results.';
