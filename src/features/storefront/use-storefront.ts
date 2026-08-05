"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getCoordinates } from "@/lib/geo";
import { DEFAULT_STOREFRONT_THEME } from "./constants";
import { useStorefrontInitialData } from "./StorefrontInitialDataProvider";
import type { PublicStorefrontData } from "./public-storefront-types";
import type { StorefrontTheme } from "./types";
import { useStorefrontNavigation } from "./use-storefront-navigation";
import { useStorefrontSession } from "./use-storefront-session";

type UseStorefrontOptions = {
  slug: string;
  onCustomerLoaded?: (profile: { name: string; phone: string }) => void;
  onMissingStore?: () => void;
};

export function useStorefront({ slug, onCustomerLoaded, onMissingStore }: UseStorefrontOptions) {
  const initialData = useStorefrontInitialData();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
  const [storefrontData, setStorefrontData] = useState<PublicStorefrontData | null>(
    initialData || null,
  );
  const [loading, setLoading] = useState(initialData === undefined);
  const [restoCoords, setRestoCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (initialData) {
      setStorefrontData(initialData);
      setLoading(false);
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    const fetchStorefront = async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/storefront/${encodeURIComponent(slug)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (response.status === 404) {
          if (mounted) {
            setStorefrontData(null);
            onMissingStore?.();
          }
          return;
        }

        if (!response.ok) throw new Error("Não foi possível carregar a vitrine.");

        const payload = (await response.json()) as PublicStorefrontData;
        if (mounted) setStorefrontData(payload);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        if (mounted) setStorefrontData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStorefront();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [initialData, onMissingStore, slug]);

  const restaurant = storefrontData?.restaurant || null;
  const categories = storefrontData?.categories || [];
  const products = storefrontData?.products || [];
  const primaryColor = restaurant?.primary_color || "#ff5a1f";
  const banners = useMemo(
    () => (Array.isArray(restaurant?.banners) ? restaurant.banners.filter(Boolean) : []),
    [restaurant?.banners],
  );
  const storefrontHeadline = restaurant?.storefront_headline || "";
  const storefrontSubheadline = restaurant?.storefront_subheadline || "";
  const storefrontTheme = useMemo<StorefrontTheme>(
    () => ({
      ...DEFAULT_STOREFRONT_THEME,
      ...((restaurant?.storefront_theme || {}) as Partial<StorefrontTheme>),
    }),
    [restaurant?.storefront_theme],
  );
  const deliveryTiers = Array.isArray(restaurant?.delivery_tiers)
    ? (restaurant.delivery_tiers as any[])
    : [];

  const { currentUser, savedAddresses } = useStorefrontSession({
    supabase,
    onCustomerLoaded,
  });
  const { currentBanner, activeCategory, setActiveCategory } = useStorefrontNavigation({
    categories,
    bannerCount: banners.length,
  });

  useEffect(() => {
    if (!restaurant) {
      setRestoCoords(null);
      return;
    }

    const latitude = Number(restaurant.latitude);
    const longitude = Number(restaurant.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude && longitude) {
      setRestoCoords({ lat: latitude, lon: longitude });
      return;
    }

    let mounted = true;
    setRestoCoords(null);

    getCoordinates({
      street: restaurant.address_street || restaurant.name,
      number: restaurant.address_number || undefined,
      neighborhood: restaurant.address_neighborhood || undefined,
      city: restaurant.address_city || undefined,
      state: restaurant.address_state || undefined,
    }).then((coordinates) => {
      if (mounted && coordinates) setRestoCoords(coordinates);
    });

    return () => {
      mounted = false;
    };
  }, [restaurant]);

  return {
    supabase,
    currentUser,
    savedAddresses,
    restaurant,
    primaryColor,
    banners,
    currentBanner,
    storefrontHeadline,
    storefrontSubheadline,
    storefrontTheme,
    categories,
    products,
    deliveryTiers,
    loading,
    restoCoords,
    activeCategory,
    setActiveCategory,
  };
}
