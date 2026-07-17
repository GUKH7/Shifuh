"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getCoordinates } from "@/lib/geo";
import { DEFAULT_STOREFRONT_THEME } from "./constants";
import type { Product, StorefrontTheme } from "./types";

type UseStorefrontOptions = {
  slug: string;
  onCustomerLoaded?: (profile: { name: string; phone: string }) => void;
  onMissingStore?: () => void;
};

export function useStorefront({ slug, onCustomerLoaded, onMissingStore }: UseStorefrontOptions) {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [primaryColor, setPrimaryColor] = useState("#ff5a1f");
  const [banners, setBanners] = useState<string[]>([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [storefrontHeadline, setStorefrontHeadline] = useState("");
  const [storefrontSubheadline, setStorefrontSubheadline] = useState("");
  const [storefrontTheme, setStorefrontTheme] =
    useState<StorefrontTheme>(DEFAULT_STOREFRONT_THEME);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveryTiers, setDeliveryTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoCoords, setRestoCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    let mounted = true;

    const checkUserSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) return;

      setCurrentUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        onCustomerLoaded?.({
          name: profile.name || "",
          phone: profile.phone || "",
        });
      }

      const { data: addresses } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", user.id);

      if (addresses && addresses.length > 0) setSavedAddresses(addresses);
    };

    const fetchStoreData = async () => {
      const publicRestaurantResult = await supabase
        .from("public_restaurants")
        .select("*")
        .eq("slug", slug)
        .single();
      let resto = publicRestaurantResult.data;

      if (!resto && publicRestaurantResult.error) {
        const { data: fallbackRestaurant } = await supabase
          .from("restaurants")
          .select("*")
          .eq("slug", slug)
          .single();

        resto = fallbackRestaurant;
      }

      if (!mounted) return;

      if (!resto) {
        onMissingStore?.();
        setLoading(false);
        return;
      }

      setRestaurant(resto);
      if (resto.delivery_tiers) setDeliveryTiers(resto.delivery_tiers as any[]);
      if (resto.primary_color) setPrimaryColor(resto.primary_color);
      if (resto.banners && Array.isArray(resto.banners) && resto.banners.length > 0) {
        setBanners(resto.banners as string[]);
      }
      setStorefrontHeadline(resto.storefront_headline || "");
      setStorefrontSubheadline(resto.storefront_subheadline || "");
      setStorefrontTheme({
        ...DEFAULT_STOREFRONT_THEME,
        ...((resto.storefront_theme || {}) as Partial<StorefrontTheme>),
      });

      if (resto.latitude && resto.longitude) {
        setRestoCoords({
          lat: Number(resto.latitude),
          lon: Number(resto.longitude),
        });
      } else {
        getCoordinates({
          street: resto.address_street || resto.name,
          number: resto.address_number || undefined,
          neighborhood: resto.address_neighborhood || undefined,
          city: resto.address_city || undefined,
          state: resto.address_state || undefined,
        }).then((coords) => {
          if (coords && mounted) setRestoCoords(coords);
        });
      }

      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", resto.id)
        .order("order");

      if (cats && mounted) {
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      }

      const { data: prods } = await supabase
        .from("products")
        .select("*")
        .eq("restaurant_id", resto.id)
        .eq("is_active", true);

      if (prods && mounted) setProducts(prods as Product[]);
      if (mounted) setLoading(false);
    };

    fetchStoreData();
    checkUserSession();

    return () => {
      mounted = false;
    };
  }, [onCustomerLoaded, onMissingStore, slug, supabase]);

  useEffect(() => {
    const timer = setInterval(() => {
      setBanners((prev) => {
        if (prev.length > 1) {
          setCurrentBanner((current) => (current + 1) % prev.length);
        }
        return prev;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const offsets = categories.map((cat) => ({
        id: cat.id,
        offset: document.getElementById(`cat-${cat.id}`)?.offsetTop || 0,
      }));
      const current = offsets.findLast((item) => window.scrollY + 240 >= item.offset);
      if (current) setActiveCategory(current.id);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categories]);

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
