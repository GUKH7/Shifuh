alter table public.restaurants
  add column if not exists delivery_rules jsonb not null default '{"version":1,"base_rule":{"step_km":1,"price_per_step":2,"max_distance":10,"default_time":30},"free_delivery":{"enabled":false,"minimum_order":50,"max_fee":5}}'::jsonb;

comment on column public.restaurants.delivery_rules is
  'Regras complementares de entrega: gerador de faixas e promoções condicionais. As faixas finais continuam em delivery_tiers.';
