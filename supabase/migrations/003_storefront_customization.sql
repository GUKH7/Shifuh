-- Personalizacao da vitrine por restaurante

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS storefront_headline TEXT,
  ADD COLUMN IF NOT EXISTS storefront_subheadline TEXT,
  ADD COLUMN IF NOT EXISTS storefront_theme JSONB DEFAULT '{
    "preset": "sunset",
    "hero_style": "banner",
    "catalog_layout": "grid",
    "card_style": "soft",
    "show_logo": true,
    "show_reviews": true
  }'::jsonb;

UPDATE public.restaurants
SET storefront_theme = COALESCE(
  storefront_theme,
  '{
    "preset": "sunset",
    "hero_style": "banner",
    "catalog_layout": "grid",
    "card_style": "soft",
    "show_logo": true,
    "show_reviews": true
  }'::jsonb
);
