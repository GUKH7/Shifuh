import type {
  IfoodConnectionCheckState,
  IfoodIntegrationState,
  StorefrontTheme,
  WorkHour,
} from "./types";

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

export const DEFAULT_IFOOD_INTEGRATION: IfoodIntegrationState = {
  merchantId: "",
  merchantName: "",
  catalogId: "",
  authType: "centralized",
  syncMode: "ifood_to_gestor",
  status: "disconnected",
  catalogSyncEnabled: true,
  orderSyncEnabled: false,
  importImages: true,
  notes: "",
  connectedAt: null,
  lastCatalogImportAt: null,
  lastCatalogExportAt: null,
  lastOrderSyncAt: null,
};

export const DEFAULT_IFOOD_CONNECTION_CHECK: IfoodConnectionCheckState = {
  status: "idle",
  summary: "",
  details: [],
  checkedAt: null,
  merchantFound: false,
  catalogResolved: false,
  catalogsCount: null,
  resolvedCatalogId: null,
};

export const IFOOD_HOMOLOGATION_SHIFTS = [
  { dayOfWeek: "SATURDAY", start: "10:00:00", duration: 540 },
  { dayOfWeek: "SUNDAY", start: "09:00:00", duration: 180 },
  { dayOfWeek: "SUNDAY", start: "13:00:00", duration: 180 },
  { dayOfWeek: "SUNDAY", start: "17:00:00", duration: 360 },
];

export const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Segunda-feira" },
  { id: 2, label: "Terca-feira" },
  { id: 3, label: "Quarta-feira" },
  { id: 4, label: "Quinta-feira" },
  { id: 5, label: "Sexta-feira" },
  { id: 6, label: "Sabado" },
];

export const DEFAULT_SCHEDULE: WorkHour[] = DAYS_OF_WEEK.map((day) => ({
  day_id: day.id,
  day_label: day.label,
  is_open: true,
  open_time: "18:00",
  close_time: "23:00",
}));
