import type { Product, StorefrontTheme } from "./types";

export interface InitialStorefrontData {
  restaurant: any;
  primaryColor: string;
  banners: string[];
  storefrontHeadline: string;
  storefrontSubheadline: string;
  storefrontTheme: StorefrontTheme;
  categories: any[];
  products: Product[];
  deliveryTiers: any[];
}
