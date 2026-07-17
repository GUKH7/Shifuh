import type { CheckoutAddress, StorefrontTheme } from "./types";

export const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  hero_style: "banner",
  catalog_layout: "grid",
  card_style: "soft",
  contrast_color: "#1f2937",
  show_logo: true,
  show_reviews: true,
  show_banners: true,
  show_featured_badge: false,
  show_promo_badge: true,
  category_style: "underline",
  highlight_badge: "",
  promo_text: "Promo do dia",
};

export const EMPTY_ADDRESS: CheckoutAddress = {
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "São Paulo",
  state: "SP",
  complement: "",
};
