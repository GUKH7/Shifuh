import type { Product, StorefrontTheme } from "./types";

export type PublicRestaurant = {
  id: string;
  slug: string;
  name: string;
  phone?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  primary_color?: string | null;
  banners?: string[] | null;
  storefront_headline?: string | null;
  storefront_subheadline?: string | null;
  storefront_theme?: Partial<StorefrontTheme> | null;
  delivery_tiers?: unknown[] | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  [key: string]: unknown;
};

export type PublicCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  order?: number | null;
  is_active?: boolean | null;
  [key: string]: unknown;
};

export type PublicStorefrontData = {
  restaurant: PublicRestaurant;
  categories: PublicCategory[];
  products: Product[];
};
