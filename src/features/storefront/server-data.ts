import "server-only";

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_STOREFRONT_THEME } from "./constants";
import type { InitialStorefrontData } from "./initial-data";
import type { Product, StorefrontTheme } from "./types";

function createPublicServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase publico nao configurado para a vitrine.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function loadPublicStorefront(slug: string): Promise<InitialStorefrontData | null> {
  const supabase = createPublicServerClient();
  const { data: restaurant, error: restaurantError } = await supabase
    .from("public_restaurants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (restaurantError) {
    throw new Error(`Falha ao carregar restaurante publico: ${restaurantError.message}`);
  }

  if (!restaurant) return null;

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("order"),
    supabase
      .from("public_storefront_products")
      .select("*")
      .eq("restaurant_id", restaurant.id),
  ]);

  if (categoriesResult.error) {
    throw new Error(`Falha ao carregar categorias publicas: ${categoriesResult.error.message}`);
  }

  if (productsResult.error) {
    throw new Error(`Falha ao carregar produtos publicos: ${productsResult.error.message}`);
  }

  const banners = Array.isArray(restaurant.banners)
    ? restaurant.banners.filter(
        (item: unknown): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  const deliveryTiers = Array.isArray(restaurant.delivery_tiers) ? restaurant.delivery_tiers : [];
  const storefrontTheme: StorefrontTheme = {
    ...DEFAULT_STOREFRONT_THEME,
    ...((restaurant.storefront_theme || {}) as Partial<StorefrontTheme>),
  };
  const categories = categoriesResult.data ?? [];
  const products = (productsResult.data ?? []) as Product[];

  return {
    restaurant,
    primaryColor: restaurant.primary_color || "#ff5a1f",
    banners,
    storefrontHeadline: restaurant.storefront_headline || "",
    storefrontSubheadline: restaurant.storefront_subheadline || "",
    storefrontTheme,
    categories,
    products,
    deliveryTiers,
  };
}

const getCachedPublicStorefront = unstable_cache(
  async (slug: string) => loadPublicStorefront(slug),
  ["public-storefront-v1"],
  { revalidate: 60 },
);

export async function getPublicStorefront(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;
  return getCachedPublicStorefront(normalizedSlug);
}
