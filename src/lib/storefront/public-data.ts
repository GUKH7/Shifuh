import "server-only";

import { cache } from "react";
import type { PublicStorefrontData } from "@/features/storefront/public-storefront-types";
import type { Product } from "@/features/storefront/types";
import { createAdminClient } from "@/lib/supabase/server";

export const getPublicStorefrontData = cache(
  async (slug: string): Promise<PublicStorefrontData | null> => {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return null;

    const supabase = createAdminClient() as any;
    const { data: restaurant, error: restaurantError } = await supabase
      .from("public_restaurants")
      .select("*")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (restaurantError) {
      throw new Error(`Não foi possível carregar a loja pública: ${restaurantError.message}`);
    }

    if (!restaurant) return null;

    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, restaurant_id, name, order, is_active")
        .eq("restaurant_id", restaurant.id)
        .eq("is_active", true)
        .order("order", { ascending: true }),
      supabase
        .from("public_storefront_products")
        .select("*")
        .eq("restaurant_id", restaurant.id),
    ]);

    if (categoriesResult.error) {
      throw new Error(`Não foi possível carregar as categorias públicas: ${categoriesResult.error.message}`);
    }

    if (productsResult.error) {
      throw new Error(`Não foi possível carregar o cardápio público: ${productsResult.error.message}`);
    }

    return {
      restaurant,
      categories: categoriesResult.data || [],
      products: (productsResult.data || []) as Product[],
    };
  },
);
