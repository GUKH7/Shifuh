create index if not exists promotion_campaigns_created_by_idx
  on public.promotion_campaigns (created_by);

create index if not exists promotion_rules_campaign_tenant_fk_idx
  on public.promotion_eligibility_rules (campaign_id, restaurant_id);

create index if not exists promotion_prizes_campaign_tenant_fk_idx
  on public.promotion_prizes (campaign_id, restaurant_id);
create index if not exists promotion_prizes_product_tenant_fk_idx
  on public.promotion_prizes (product_id, restaurant_id);

create index if not exists promotion_spins_campaign_tenant_fk_idx
  on public.promotion_spins (campaign_id, restaurant_id);
create index if not exists promotion_spins_customer_tenant_fk_idx
  on public.promotion_spins (customer_id, restaurant_id);
create index if not exists promotion_spins_order_tenant_fk_idx
  on public.promotion_spins (source_order_id, restaurant_id);
create index if not exists promotion_spins_rule_tenant_fk_idx
  on public.promotion_spins (eligibility_rule_id, restaurant_id, campaign_id);

create index if not exists promotion_results_spin_tenant_fk_idx
  on public.promotion_spin_results (spin_id, restaurant_id, campaign_id, customer_id);
create index if not exists promotion_results_prize_tenant_fk_idx
  on public.promotion_spin_results (prize_id, restaurant_id, campaign_id);
create index if not exists promotion_results_product_tenant_fk_idx
  on public.promotion_spin_results (product_id, restaurant_id);

create index if not exists customer_rewards_campaign_tenant_fk_idx
  on public.customer_rewards (campaign_id, restaurant_id);
create index if not exists customer_rewards_customer_tenant_fk_idx
  on public.customer_rewards (customer_id, restaurant_id);
create index if not exists customer_rewards_spin_tenant_fk_idx
  on public.customer_rewards (spin_id, restaurant_id, campaign_id, customer_id);
create index if not exists customer_rewards_result_tenant_fk_idx
  on public.customer_rewards (spin_result_id, restaurant_id);
create index if not exists customer_rewards_prize_tenant_fk_idx
  on public.customer_rewards (prize_id, restaurant_id, campaign_id);
create index if not exists customer_rewards_product_tenant_fk_idx
  on public.customer_rewards (product_id, restaurant_id);
create index if not exists customer_rewards_redeemed_order_tenant_fk_idx
  on public.customer_rewards (redeemed_order_id, restaurant_id);
