export interface DeliveryTier {
  distance: number;
  time: number;
  price: number;
}

export interface WorkHour {
  day_id: number;
  day_label: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface StorefrontTheme {
  hero_style: "banner" | "split" | "spotlight";
  catalog_layout: "grid" | "list";
  card_style: "soft" | "outline" | "elevated";
  contrast_color: string;
  show_logo: boolean;
  show_reviews: boolean;
  show_banners: boolean;
  show_featured_badge: boolean;
  show_promo_badge: boolean;
  category_style: "underline" | "pill";
  highlight_badge: string;
  promo_text: string;
  banner_product_links: Record<string, string>;
}

export interface IfoodIntegrationState {
  merchantId: string;
  merchantName: string;
  catalogId: string;
  authType: "centralized";
  syncMode: "ifood_to_gestor" | "gestor_to_ifood" | "bidirectional";
  status: "disconnected" | "configuring" | "homologation" | "connected";
  catalogSyncEnabled: boolean;
  orderSyncEnabled: boolean;
  importImages: boolean;
  notes: string;
  connectedAt: string | null;
  lastCatalogImportAt: string | null;
  lastCatalogExportAt: string | null;
  lastOrderSyncAt: string | null;
}

export interface IfoodConnectionCheckState {
  status: "idle" | "checking" | "success" | "error";
  summary: string;
  details: string[];
  checkedAt: string | null;
  merchantFound: boolean;
  catalogResolved: boolean;
  catalogsCount: number | null;
  resolvedCatalogId: string | null;
}

export interface IfoodMerchantSnapshot {
  merchants?: unknown;
  details?: unknown;
  status?: unknown;
  interruptions?: unknown;
  openingHours?: unknown;
  checkedAt?: string;
}
