"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  CircleHelp,
  CheckCircle,
  ChevronDown,
  Clock,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Scissors,
  Smartphone,
  Store,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Cropper from "react-easy-crop";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { getCoordinates } from "@/lib/geo";
import { useToast } from "@/components/ui/toast-provider";

interface DeliveryTier {
  distance: number;
  time: number;
  price: number;
}

interface WorkHour {
  day_id: number;
  day_label: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

interface StorefrontTheme {
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
}

interface IfoodIntegrationState {
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

interface IfoodConnectionCheckState {
  status: "idle" | "checking" | "success" | "error";
  summary: string;
  details: string[];
  checkedAt: string | null;
  merchantFound: boolean;
  catalogResolved: boolean;
  catalogsCount: number | null;
  resolvedCatalogId: string | null;
}

const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  hero_style: "banner",
  catalog_layout: "grid",
  card_style: "soft",
  contrast_color: "#1f2937",
  show_logo: true,
  show_reviews: true,
  show_banners: true,
  show_featured_badge: true,
  show_promo_badge: true,
  category_style: "underline",
  highlight_badge: "Mais pedido",
  promo_text: "Promo do dia",
};

const DEFAULT_IFOOD_INTEGRATION: IfoodIntegrationState = {
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

const DEFAULT_IFOOD_CONNECTION_CHECK: IfoodConnectionCheckState = {
  status: "idle",
  summary: "",
  details: [],
  checkedAt: null,
  merchantFound: false,
  catalogResolved: false,
  catalogsCount: null,
  resolvedCatalogId: null,
};

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" },
  { id: 1, label: "Segunda-feira" },
  { id: 2, label: "Terca-feira" },
  { id: 3, label: "Quarta-feira" },
  { id: 4, label: "Quinta-feira" },
  { id: 5, label: "Sexta-feira" },
  { id: 6, label: "Sabado" },
];

const DEFAULT_SCHEDULE: WorkHour[] = DAYS_OF_WEEK.map((day) => ({
  day_id: day.id,
  day_label: day.label,
  is_open: true,
  open_time: "18:00",
  close_time: "23:00",
}));

function normalizeWorkHours(rawValue: unknown): WorkHour[] {
  const incoming = Array.isArray(rawValue) ? rawValue : [];

  return DAYS_OF_WEEK.map((day) => {
    const match = incoming.find((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<WorkHour>;
      return Number(candidate.day_id) === day.id;
    }) as Partial<WorkHour> | undefined;

    return {
      day_id: day.id,
      day_label: match?.day_label || day.label,
      is_open: typeof match?.is_open === "boolean" ? match.is_open : true,
      open_time: match?.open_time || "18:00",
      close_time: match?.close_time || "23:00",
    };
  });
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;

  if (full.length !== 6) return `rgba(17, 24, 39, ${opacity})`;

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], "cropped-image.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92),
  );
}

function FieldHint({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-white text-gray-400"
    >
      <CircleHelp size={12} />
    </span>
  );
}

function CollapsibleSection({
  icon,
  title,
  description,
  children,
  className = "",
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`surface-card rounded-[28px] p-6 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">{icon}</div>
          <div>
            <h2 className="text-xl font-black text-gray-950">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-gray-500">
          <ChevronDown
            size={18}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {isOpen && children}
    </section>
  );
}

async function readJsonResponse(response: Response) {
  const payloadText = await response.text();

  if (!payloadText) {
    return {};
  }

  try {
    return JSON.parse(payloadText) as Record<string, any>;
  } catch {
    return {
      error: payloadText,
    };
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantLatitude, setRestaurantLatitude] = useState<number | null>(null);
  const [restaurantLongitude, setRestaurantLongitude] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({
    zip: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [primaryColor, setPrimaryColor] = useState("#ff5a1f");
  const [logoUrl, setLogoUrl] = useState("");
  const [banners, setBanners] = useState<string[]>([]);
  const [storefrontHeadline, setStorefrontHeadline] = useState("");
  const [storefrontSubheadline, setStorefrontSubheadline] = useState("");
  const [storefrontTheme, setStorefrontTheme] = useState<StorefrontTheme>(DEFAULT_STOREFRONT_THEME);
  const [tiers, setTiers] = useState<DeliveryTier[]>([]);
  const [schedule, setSchedule] = useState<WorkHour[]>(DEFAULT_SCHEDULE);
  const [printerWidth, setPrinterWidth] = useState(80);
  const [printerFontSize, setPrinterFontSize] = useState(12);
  const [printerFontWeight, setPrinterFontWeight] = useState(700);
  const [printerAutoPrint, setPrinterAutoPrint] = useState(false);
  const [isImportingIfoodCatalog, setIsImportingIfoodCatalog] = useState(false);
  const [isCheckingIfoodConnection, setIsCheckingIfoodConnection] = useState(false);
  const [isSyncingIfoodOrders, setIsSyncingIfoodOrders] = useState(false);
  const [isImportingIfoodLink, setIsImportingIfoodLink] = useState(false);
  const [ifoodIntegration, setIfoodIntegration] =
    useState<IfoodIntegrationState>(DEFAULT_IFOOD_INTEGRATION);
  const [ifoodConnectionCheck, setIfoodConnectionCheck] = useState<IfoodConnectionCheckState>(
    DEFAULT_IFOOD_CONNECTION_CHECK,
  );
  const [ifoodPublicUrl, setIfoodPublicUrl] = useState("");
  const [wppStatus, setWppStatus] = useState<string>("iniciando");
  const [wppQrCode, setWppQrCode] = useState<string>("");
  const [isRestarting, setIsRestarting] = useState(false);
  const [cropTarget, setCropTarget] = useState<"logo" | "banner" | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const checkWppStatus = async () => {
      try {
        const res = await fetch("http://64.181.189.107:3001/status");
        const data = await res.json();
        setWppStatus(data.status);
        setWppQrCode(data.qrcode);
      } catch (error) {
        console.error("Erro ao obter status do WhatsApp:", error);
        setWppStatus("desconectado");
      }
    };

    checkWppStatus();
    const interval = setInterval(checkWppStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchSettings = async () => {
    try {
      const { restaurant: data, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");

      if (data) {
        setRestaurantId(data.id);
        setRestaurantLatitude(data.latitude ?? null);
        setRestaurantLongitude(data.longitude ?? null);
        setName(data.name || "");
        setPhone(data.phone || "");
        setPrimaryColor(data.primary_color || "#ff5a1f");
        setLogoUrl(data.logo_url || data.image_url || "");
        setBanners(data.banners || []);
        setStorefrontHeadline(data.storefront_headline || "");
        setStorefrontSubheadline(data.storefront_subheadline || "");
        setStorefrontTheme({
          ...DEFAULT_STOREFRONT_THEME,
          ...(data.storefront_theme || {}),
        });
        setAddress({
          zip: data.address_zip || "",
          street: data.address_street || "",
          number: data.address_number || "",
          neighborhood: data.address_neighborhood || "",
          city: data.address_city || "",
          state: data.address_state || "",
        });
        if (data.delivery_tiers) setTiers(data.delivery_tiers);
        else setTiers([{ distance: 1, time: 20, price: 0 }]);
        setSchedule(normalizeWorkHours(data.work_hours));
        setPrinterWidth(data.printer_width || 80);
        setPrinterFontSize(data.printer_font_size || 12);
        setPrinterFontWeight(data.printer_font_weight || 700);
        setPrinterAutoPrint(Boolean(data.printer_auto_print));

        const { data: ifoodData } = await supabase
          .from("ifood_integrations")
          .select("*")
          .eq("restaurant_id", data.id)
          .maybeSingle();

        if (ifoodData) {
          setIfoodIntegration({
            merchantId: ifoodData.merchant_id || "",
            merchantName: ifoodData.merchant_name || "",
            catalogId: ifoodData.catalog_id || "",
            authType: "centralized",
            syncMode: (ifoodData.sync_mode as IfoodIntegrationState["syncMode"]) || "ifood_to_gestor",
            status: (ifoodData.status as IfoodIntegrationState["status"]) || "disconnected",
            catalogSyncEnabled: Boolean(ifoodData.catalog_sync_enabled),
            orderSyncEnabled: Boolean(ifoodData.order_sync_enabled),
            importImages: Boolean(ifoodData.import_images),
            notes: ifoodData.notes || "",
            connectedAt: ifoodData.connected_at,
            lastCatalogImportAt: ifoodData.last_catalog_import_at,
            lastCatalogExportAt: ifoodData.last_catalog_export_at,
            lastOrderSyncAt: ifoodData.last_order_sync_at,
          });
        } else {
          setIfoodIntegration(DEFAULT_IFOOD_INTEGRATION);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("restaurant-images").upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("restaurant-images").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const openCropper = (file: File, target: "logo" | "banner") => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setCropSource(reader.result as string);
      setCropTarget(target);
      setCropAspect(target === "logo" ? 1 : 16 / 7);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    });
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    openCropper(e.target.files[0], "logo");
    e.target.value = "";
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    openCropper(e.target.files[0], "banner");
    e.target.value = "";
  };

  const closeCropper = () => {
    setCropTarget(null);
    setCropSource(null);
    setCroppedAreaPixels(null);
    setZoom(1);
  };

  const onCropComplete = useCallback((_: unknown, croppedArea: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(croppedArea);
  }, []);

  const handleConfirmCrop = async () => {
    if (!cropSource || !croppedAreaPixels || !cropTarget) return;
    setUploading(true);
    try {
      const croppedFile = await getCroppedImg(cropSource, croppedAreaPixels);
    if (!croppedFile) throw new Error("Não foi possível recortar a imagem.");
      const publicUrl = await uploadFile(croppedFile);
      if (cropTarget === "logo") {
        setLogoUrl(publicUrl);
      } else {
        setBanners((current) => [...current, publicUrl]);
      }
      closeCropper();
      showToast({
        title: cropTarget === "logo" ? "Logo atualizada" : "Banner adicionado",
        description: "A imagem foi recortada e salva com sucesso.",
        tone: "success",
      });
    } catch (error) {
      console.error(error);
      showToast({
        title: "Falha no upload da imagem",
        description: "Tente novamente com outro arquivo.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const sortedTiers = [...tiers].sort((a, b) => a.distance - b.distance);
    const normalizedSchedule = normalizeWorkHours(schedule);
    let latitude: number | null = restaurantLatitude;
    let longitude: number | null = restaurantLongitude;

    const fullAddress = [
      address.street,
      address.number,
      address.neighborhood,
      address.city,
      address.state,
      "Brasil",
    ]
      .filter(Boolean)
      .join(", ");

    if (fullAddress) {
      const coords = await getCoordinates(fullAddress);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
      }
    }

    const { error } = await supabase
      .from("restaurants")
      .update({
        name,
        phone,
        delivery_tiers: sortedTiers,
        work_hours: normalizedSchedule,
        address_zip: address.zip,
        address_street: address.street,
        address_number: address.number,
        address_neighborhood: address.neighborhood,
        address_city: address.city,
        address_state: address.state,
        latitude,
        longitude,
        primary_color: primaryColor,
        logo_url: logoUrl,
        image_url: logoUrl,
        banners,
        storefront_headline: storefrontHeadline,
        storefront_subheadline: storefrontSubheadline,
        storefront_theme: storefrontTheme,
        printer_width: printerWidth,
        printer_font_size: printerFontSize,
        printer_font_weight: printerFontWeight,
        printer_auto_print: printerAutoPrint,
      })
      .eq("id", restaurantId);

    let ifoodError: { message?: string } | null = null;

    if (!error && restaurantId) {
      const shouldStampConnectedAt =
        ifoodIntegration.status === "connected" && !ifoodIntegration.connectedAt;

      const { error: integrationError } = await supabase
        .from("ifood_integrations")
        .upsert(
          {
            restaurant_id: restaurantId,
            merchant_id: ifoodIntegration.merchantId || null,
            merchant_name: ifoodIntegration.merchantName || null,
            catalog_id: ifoodIntegration.catalogId || null,
            auth_type: ifoodIntegration.authType,
            sync_mode: ifoodIntegration.syncMode,
            status: ifoodIntegration.status,
            catalog_sync_enabled: ifoodIntegration.catalogSyncEnabled,
            order_sync_enabled: ifoodIntegration.orderSyncEnabled,
            import_images: ifoodIntegration.importImages,
            notes: ifoodIntegration.notes || null,
            connected_at: shouldStampConnectedAt
              ? new Date().toISOString()
              : ifoodIntegration.status === "disconnected"
                ? null
                : ifoodIntegration.connectedAt,
          },
          { onConflict: "restaurant_id" },
        );

      ifoodError = integrationError;
    }

    if (error || ifoodError) {
      const currentError = error || ifoodError;
      console.error("Erro ao salvar configurações:", currentError);
      const missingStorefrontColumn =
        currentError?.message?.includes("storefront_") || (error as any)?.code === "42703";
      const missingPrintColumn = currentError?.message?.includes("printer_auto_print");
      const missingIfoodTable = currentError?.message?.includes("ifood_integrations");

      if (missingPrintColumn) {
        showToast({
          title: "Migration pendente no Supabase",
          description: "A migration 010_auto_print_on_accept.sql ainda precisa ser aplicada.",
          tone: "error",
        });
      } else if (missingStorefrontColumn) {
        showToast({
          title: "Migration pendente no Supabase",
          description: "A migration 003_storefront_customization.sql ainda precisa ser aplicada.",
          tone: "error",
        });
      } else if (missingIfoodTable) {
        showToast({
          title: "Migration pendente no Supabase",
          description: "A migration 011_ifood_integration_foundation.sql ainda precisa ser aplicada.",
          tone: "error",
        });
      } else {
        showToast({
          title: "Não foi possível salvar",
          description: currentError?.message,
          tone: "error",
        });
      }
    } else {
      showToast({
        title: "Configurações salvas",
        description: "Os dados da loja foram atualizados com sucesso.",
        tone: "success",
      });
      setRestaurantLatitude(latitude);
      setRestaurantLongitude(longitude);
      setSchedule(normalizedSchedule);
      fetchSettings();
    }
    setSaving(false);
  };

  const handleRestartWpp = async () => {
    setIsRestarting(true);
    setWppStatus("iniciando");
    setWppQrCode("");
    try {
      await fetch("http://64.181.189.107:3001/restart");
    } catch (error) {
      console.error(error);
    }
    setTimeout(() => setIsRestarting(false), 3000);
  };

  const handleBlurCep = async () => {
    const cep = address.zip.replace(/\D/g, "");
    if (cep.length < 8) return;
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (!data.erro) {
      setAddress((prev) => ({
        ...prev,
        street: data.logradouro,
        neighborhood: data.bairro,
        city: data.localidade,
        state: data.uf,
      }));
    }
  };

  const updateTier = (index: number, field: keyof DeliveryTier, value: string) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: parseFloat(value) || 0 };
    setTiers(newTiers);
  };

  const addTier = () => setTiers([...tiers, { distance: 1, time: 30, price: 5 }]);
  const removeTier = (index: number) => setTiers(tiers.filter((_, i) => i !== index));

  const handleTimeChange = (index: number, field: keyof WorkHour, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], [field]: value };
    setSchedule(newSchedule);
  };

  const updateStorefrontTheme = <K extends keyof StorefrontTheme>(
    field: K,
    value: StorefrontTheme[K],
  ) => {
    setStorefrontTheme((current) => ({ ...current, [field]: value }));
  };

  const updateIfoodIntegration = <K extends keyof IfoodIntegrationState>(
    field: K,
    value: IfoodIntegrationState[K],
  ) => {
    setIfoodIntegration((current) => ({ ...current, [field]: value }));
  };

  const formatSyncDate = (value: string | null) => {
    if (!value) return "Ainda não sincronizado";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const handleImportIfoodCatalog = async () => {
    if (!restaurantId) return;

    setIsImportingIfoodCatalog(true);
    try {
      const response = await fetch("/api/integrations/ifood/catalog/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível importar o catálogo do iFood.");
      }

      showToast({
        title: "Catálogo importado",
        description: `${result.summary.createdCategories + result.summary.updatedCategories} categorias e ${result.summary.createdProducts + result.summary.updatedProducts} produtos foram processados.`,
        tone: "success",
      });

      fetchSettings();
    } catch (error) {
      showToast({
        title: "Falha ao importar catálogo",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível puxar o catálogo do iFood agora.",
        tone: "error",
      });
    } finally {
      setIsImportingIfoodCatalog(false);
    }
  };

  const handleImportIfoodPublicLink = async () => {
    if (!restaurantId) return;

    setIsImportingIfoodLink(true);
    try {
      const response = await fetch("/api/integrations/ifood/public-link/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId,
          publicUrl: ifoodPublicUrl,
        }),
      });

      const result = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          result.error || "Não foi possível copiar o cardápio do link público do iFood.",
        );
      }

      if (result.summary?.merchantUuid) {
        updateIfoodIntegration("merchantId", result.summary.merchantUuid);
      }

      if (result.summary?.storeName && !ifoodIntegration.merchantName) {
        updateIfoodIntegration("merchantName", result.summary.storeName);
      }

      showToast({
        title: result.summary?.menuFound
          ? "Cardápio copiado pelo link"
          : "Loja importada pelo link",
        description: result.summary?.menuFound
          ? `${result.summary.categoriesProcessed} categorias e ${result.summary.productsProcessed} produtos foram processados.`
          : "Os dados públicos da loja foram trazidos. O cardápio completo não veio exposto nessa carga pública do iFood.",
        tone: "success",
      });

      fetchSettings();
    } catch (error) {
      showToast({
        title: "Falha ao importar pelo link",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível importar esse link público do iFood agora.",
        tone: "error",
      });
    } finally {
      setIsImportingIfoodLink(false);
    }
  };

  const handleSyncIfoodOrders = async () => {
    if (!restaurantId) return;

    setIsSyncingIfoodOrders(true);
    try {
      const response = await fetch("/api/integrations/ifood/orders/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível sincronizar os pedidos do iFood.");
      }

      showToast({
        title: "Pedidos iFood sincronizados",
        description:
          result.summary.eventsReceived > 0
            ? `${result.summary.eventsProcessed} evento(s) processado(s) e ${result.summary.eventsAcknowledged} ACK enviado(s).`
            : "Nenhum evento novo foi encontrado na loja de teste.",
        tone: "success",
      });

      fetchSettings();
    } catch (error) {
      showToast({
        title: "Falha ao sincronizar pedidos",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar os eventos do iFood agora.",
        tone: "error",
      });
    } finally {
      setIsSyncingIfoodOrders(false);
    }
  };

  const handleCheckIfoodConnection = async () => {
    if (!restaurantId) return;

    setIsCheckingIfoodConnection(true);
    setIfoodConnectionCheck((current) => ({
      ...current,
      status: "checking",
      summary: "",
      details: [],
    }));

    try {
      const response = await fetch("/api/integrations/ifood/connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId,
          merchantId: ifoodIntegration.merchantId,
          catalogId: ifoodIntegration.catalogId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível validar a conexão com o iFood.");
      }

      setIfoodConnectionCheck({
        status: "success",
        summary: result.summary || "Conexão validada com sucesso.",
        details: Array.isArray(result.details) ? result.details : [],
        checkedAt: result.checkedAt || new Date().toISOString(),
        merchantFound: Boolean(result.merchantFound),
        catalogResolved: Boolean(result.catalogResolved),
        catalogsCount:
          typeof result.catalogsCount === "number" ? result.catalogsCount : null,
        resolvedCatalogId: result.resolvedCatalogId || null,
      });

      if (result.resolvedCatalogId && !ifoodIntegration.catalogId) {
        updateIfoodIntegration("catalogId", result.resolvedCatalogId);
      }

      showToast({
        title: "Conexão iFood validada",
        description: result.summary || "As credenciais e a loja responderam corretamente.",
        tone: "success",
      });
    } catch (error) {
      const description =
        error instanceof Error
          ? error.message
          : "Não foi possível validar a conexão com o iFood.";

      setIfoodConnectionCheck({
        status: "error",
        summary: description,
        details: [
          "Confira se IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET estão configurados na Vercel.",
          "Confirme se o app do iFood já tem os escopos liberados para a Merchant API.",
          "Verifique se o ID do merchant pertence à loja conectada no app do iFood.",
        ],
        checkedAt: new Date().toISOString(),
        merchantFound: false,
        catalogResolved: false,
        catalogsCount: null,
        resolvedCatalogId: null,
      });

      showToast({
        title: "Falha ao validar iFood",
        description,
        tone: "error",
      });
    } finally {
      setIsCheckingIfoodConnection(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm font-semibold text-gray-500">
        <Loader2 className="mr-2 animate-spin text-[var(--brand)]" size={18} />
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Configurações</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Atualize dados da loja, identidade visual e regras de entrega.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="brand-gradient rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar alterações
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-5">
        <CollapsibleSection
          icon={<Store size={20} />}
          title="Dados da loja"
          description="Nome, WhatsApp e endereço da operação."
        >
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da loja" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
            <input value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} onBlur={handleBlurCep} placeholder="CEP" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
            <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Cidade" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
            <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Rua" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)] md:col-span-2" />
            <input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} placeholder="Número" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
            <input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} placeholder="Bairro" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]" />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          icon={<Palette size={20} />}
          title="Aparência da loja"
          description="Logo, banners, visual da vitrine e preview em um só lugar."
        >
          <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <div className="rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Identidade visual</p>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-[var(--line)] bg-white">
                    {logoUrl ? <img src={logoUrl} className="h-full w-full object-cover" /> : <ImageIcon className="text-gray-300" />}
                  </div>
                  <div className="flex-1 space-y-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700">
                      <UploadCloud size={16} />
                      Trocar logo
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                    </label>
                    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm text-gray-500">
                      <p className="font-bold text-gray-700">Logo recomendado</p>
                      <p className="mt-1">Formato `PNG` ou `JPG`, proporção quadrada `1:1`.</p>
                      <p className="mt-1">Tamanho ideal: `512x512 px` ou maior.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="rounded-2xl border border-[var(--line)] bg-white p-3">
                        <span className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                          Cor principal
                          <FieldHint label="Essa cor aparece como destaque da sua marca e conversa com o restante da vitrine." />
                        </span>
                        <div className="flex items-center gap-3">
                          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-11 w-11 rounded-xl border border-[var(--line)] bg-white p-1" />
                          <span className="text-sm font-medium text-gray-500">{primaryColor}</span>
                        </div>
                      </label>
                      <label className="rounded-2xl border border-[var(--line)] bg-white p-3">
                        <span className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                          Cor de contraste
                          <FieldHint label="Usada para destacar selos, chips e criar contraste com a cor principal." />
                        </span>
                        <div className="flex items-center gap-3">
                          <input type="color" value={storefrontTheme.contrast_color} onChange={(e) => updateStorefrontTheme("contrast_color", e.target.value)} className="h-11 w-11 rounded-xl border border-[var(--line)] bg-white p-1" />
                          <span className="text-sm font-medium text-gray-500">{storefrontTheme.contrast_color}</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Banners e mensagem principal</p>
                <div className="mt-4 space-y-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-6 text-center">
                    <Plus className="mb-2 text-gray-400" size={18} />
                    <span className="text-sm font-bold text-gray-700">Adicionar banner</span>
                    <span className="mt-1 text-xs text-gray-400">Suba imagens para destacar promoções. Você poderá recortar antes de salvar.</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploading} />
                  </label>
                  <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm text-gray-500">
                    <p className="font-bold text-gray-700">Banner recomendado</p>
                    <p className="mt-1">Formato `PNG` ou `JPG`, proporção horizontal `3:1`.</p>
                    <p className="mt-1">Tamanho ideal: `1500x500 px` ou maior.</p>
                  </div>
                  <div className="space-y-2">
                    {banners.map((banner, index) => (
                      <div key={index} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white p-2.5">
                        <div className="flex items-center gap-3">
                          <img src={banner} className="h-10 w-16 rounded-xl object-cover" />
                          <span className="text-sm font-medium text-gray-600">Banner {index + 1}</span>
                        </div>
                        <button onClick={() => setBanners(banners.filter((_, i) => i !== index))} className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {banners.length === 0 && <p className="text-center text-sm text-gray-400">Nenhum banner enviado.</p>}
                  </div>
                  <div className="grid gap-4">
                    <input
                      value={storefrontHeadline}
                      onChange={(e) => setStorefrontHeadline(e.target.value)}
                      placeholder="Título comercial da vitrine"
                      className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    />
                    <textarea
                      value={storefrontSubheadline}
                      onChange={(e) => setStorefrontSubheadline(e.target.value)}
                      rows={3}
                      placeholder="Texto curto para destacar proposta, promoção ou estilo da loja"
                      className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">O que aparece na vitrine</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                      Mostrar logo no topo
                      <FieldHint label="Exibe o logo da loja sobre a capa da vitrine." />
                    </span>
                    <input type="checkbox" checked={storefrontTheme.show_logo} onChange={(e) => updateStorefrontTheme("show_logo", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                      Mostrar nota da loja
                      <FieldHint label="Exibe a nota média da loja ao lado do nome." />
                    </span>
                    <input type="checkbox" checked={storefrontTheme.show_reviews} onChange={(e) => updateStorefrontTheme("show_reviews", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                      Usar imagens de capa
                      <FieldHint label="Mostra banners ou foto principal na capa da vitrine." />
                    </span>
                    <input type="checkbox" checked={storefrontTheme.show_banners} onChange={(e) => updateStorefrontTheme("show_banners", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                  </label>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Mais pedido</p>
                        <p className="mt-1 text-xs text-gray-500">Mostra um selo de destaque perto das informações da loja.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={storefrontTheme.show_featured_badge}
                        onChange={(e) => updateStorefrontTheme("show_featured_badge", e.target.checked)}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                    </div>
                    {storefrontTheme.show_featured_badge && (
                      <input
                        value={storefrontTheme.highlight_badge}
                        onChange={(e) => updateStorefrontTheme("highlight_badge", e.target.value)}
                        placeholder="Texto do selo: Ex. Mais pedido"
                        className="mt-4 w-full rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                      />
                    )}
                  </div>

                  <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Promo do dia</p>
                        <p className="mt-1 text-xs text-gray-500">Exibe uma faixa promocional no topo da vitrine.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={storefrontTheme.show_promo_badge}
                        onChange={(e) => updateStorefrontTheme("show_promo_badge", e.target.checked)}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                    </div>
                    {storefrontTheme.show_promo_badge && (
                      <input
                        value={storefrontTheme.promo_text}
                        onChange={(e) => updateStorefrontTheme("promo_text", e.target.value)}
                        placeholder="Texto promocional: Ex. Promo do dia"
                        className="mt-4 w-full rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[var(--line)] bg-[#fcfaf7] p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Preview da vitrine</p>
              <div
                className="mt-4 overflow-hidden rounded-[24px] border border-[var(--line)]"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${storefrontTheme.contrast_color} 100%)`,
                }}
              >
                <div className="bg-black/15 px-4 pb-4 pt-4 text-white">
                  <div className={`rounded-[22px] border border-white/15 bg-white/12 p-4 backdrop-blur-md ${storefrontTheme.hero_style === "split" ? "ml-auto max-w-[82%]" : "max-w-xl"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {storefrontTheme.show_promo_badge && storefrontTheme.promo_text && (
                          <span
                            className="mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.92)",
                              color: storefrontTheme.contrast_color,
                            }}
                          >
                            {storefrontTheme.promo_text || "Promo do dia"}
                          </span>
                        )}
                        <h3 className="text-xl font-black leading-tight">
                          {storefrontHeadline || name || "Sua loja no WhatsApp com cara profissional"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-white/80">
                          {storefrontSubheadline || "A capa da vitrine ajuda a destacar sua marca, sua promoção e sua proposta de valor."}
                        </p>
                      </div>
                      <button className="rounded-full border border-white/20 bg-white/90 px-3 py-1.5 text-[11px] font-bold text-gray-800">Minha conta</button>
                    </div>
                  </div>
                </div>
                <div className="bg-[#fffdfa] p-4">
                  <div className="-mt-4 mb-3 flex items-end gap-3">
                    {storefrontTheme.show_logo && (
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border-[3px] border-white bg-white shadow-[0_10px_24px_rgba(17,16,15,0.12)]">
                        {logoUrl ? <img src={logoUrl} className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ backgroundColor: primaryColor }} />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="truncate text-base font-black text-gray-950">{name || "Sua loja"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-gray-500">
                        {storefrontTheme.show_reviews && <span>5,0</span>}
                        <span>30-45 min</span>
                        <span className="text-emerald-700">Aberto</span>
                        {storefrontTheme.show_featured_badge && storefrontTheme.highlight_badge && (
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]"
                            style={{
                              backgroundColor: hexToRgba(storefrontTheme.contrast_color, 0.14),
                              color: storefrontTheme.contrast_color,
                            }}
                          >
                            {storefrontTheme.highlight_badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mb-3 flex gap-2 overflow-hidden">
                    <span
                      className={`text-xs font-bold ${storefrontTheme.category_style === "pill" ? "rounded-full px-3 py-2" : "border-b-2 px-1 pb-2"}`}
                      style={
                        storefrontTheme.category_style === "pill"
                          ? { backgroundColor: hexToRgba(primaryColor, 0.14), color: primaryColor }
                          : { borderColor: primaryColor, color: primaryColor }
                      }
                    >
                      Espetos
                    </span>
                    <span className={`text-xs font-bold text-gray-500 ${storefrontTheme.category_style === "pill" ? "rounded-full border border-gray-200 bg-white px-3 py-2" : "px-1 pb-2"}`}>Combos</span>
                  </div>
                  <div className={`grid gap-3 ${storefrontTheme.catalog_layout === "grid" ? "md:grid-cols-2" : "grid-cols-1"}`}>
                    <div className={`rounded-2xl bg-white p-4 ${storefrontTheme.card_style === "outline" ? "border-2 border-gray-200" : storefrontTheme.card_style === "elevated" ? "shadow-[0_18px_32px_rgba(17,16,15,0.12)]" : "shadow-sm"}`}>
                      <div className={`${storefrontTheme.catalog_layout === "grid" ? "h-24" : "h-14"} rounded-xl bg-[#f3ede5]`} />
                      <p className="mt-3 font-bold text-gray-900">Espeto especial da casa</p>
                      <p className="mt-1 text-sm text-gray-500">Com farofa, molho verde e acompanhamentos.</p>
                      <p className="mt-3 text-sm font-black text-gray-950">R$ 18,90</p>
                    </div>
                    <div className={`rounded-2xl bg-white p-4 ${storefrontTheme.card_style === "outline" ? "border-2 border-gray-200" : storefrontTheme.card_style === "elevated" ? "shadow-[0_18px_32px_rgba(17,16,15,0.12)]" : "shadow-sm"}`}>
                      <div className={`${storefrontTheme.catalog_layout === "grid" ? "h-24" : "h-14"} rounded-xl bg-[#f3ede5]`} />
                      <p className="mt-3 font-bold text-gray-900">Combo promocional</p>
                      <p className="mt-1 text-sm text-gray-500">Pedido rápido para destacar conversão e ticket médio.</p>
                      <p className="mt-3 text-sm font-black text-gray-950">R$ 29,90</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          icon={<ArrowDownUp size={20} />}
          title="Integração iFood"
          description="Conecte sua loja, teste a integração e puxe catálogo e pedidos sem complicação."
          defaultOpen={false}
        >
          <div className="mt-6 rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
                  Situação atual
                </p>
                <p className="mt-2 text-lg font-black text-gray-950">
                  {ifoodConnectionCheck.status === "success"
                    ? "Loja pronta para testar"
                    : ifoodConnectionCheck.status === "error"
                      ? "Revisar conexão"
                      : ifoodIntegration.status === "connected"
                        ? "Integração conectada"
                        : ifoodIntegration.status === "homologation"
                          ? "Aguardando homologação"
                          : ifoodIntegration.status === "configuring"
                            ? "Configuração em andamento"
                            : "Conecte sua loja ao iFood"}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                  {ifoodConnectionCheck.status === "idle"
                    ? "Informe o código da loja no iFood, teste a conexão e depois importe o catálogo ou sincronize pedidos de teste."
                    : ifoodConnectionCheck.summary}
                </p>
              </div>
              <div className="grid min-w-[220px] gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Conexão</p>
                  <p className="mt-2 text-sm font-black text-gray-950">
                    {ifoodConnectionCheck.status === "success"
                      ? "Validada"
                      : ifoodConnectionCheck.status === "error"
                        ? "Com erro"
                        : ifoodIntegration.status === "homologation"
                          ? "Homologação"
                          : ifoodIntegration.status === "configuring"
                            ? "Em preparo"
                            : "Pendente"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Catálogo</p>
                  <p className="mt-2 text-sm font-black text-gray-950">
                    {ifoodIntegration.lastCatalogImportAt ? "Importado" : "Ainda não puxado"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">Pedidos</p>
                  <p className="mt-2 text-sm font-black text-gray-950">
                    {ifoodIntegration.lastOrderSyncAt ? "Sincronizado" : "Ainda não testado"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <label className="space-y-2">
                <span className="text-sm font-bold text-gray-700">Código da loja no iFood</span>
                <input
                  value={ifoodIntegration.merchantId}
                  onChange={(e) => updateIfoodIntegration("merchantId", e.target.value)}
                  placeholder="Cole aqui o Merchant ID ou Merchant UUID"
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                />
                <p className="text-xs text-gray-400">
                  Você encontra esse código na área de testes do portal do iFood.
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-gray-700">Nome da loja no iFood</span>
                <input
                  value={ifoodIntegration.merchantName}
                  onChange={(e) => updateIfoodIntegration("merchantName", e.target.value)}
                  placeholder="Ex.: Loja teste do iFood"
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                />
                <p className="text-xs text-gray-400">
                  Campo opcional, usado só para facilitar a identificação da loja.
                </p>
              </label>
            </div>

            <div className="mt-4 rounded-[22px] border border-dashed border-[var(--line)] bg-[#fcfaf7] p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <label className="flex-1 space-y-2">
                  <span className="text-sm font-bold text-gray-700">Link público do iFood</span>
                  <input
                    value={ifoodPublicUrl}
                    onChange={(e) => setIfoodPublicUrl(e.target.value)}
                    placeholder="Cole aqui o link público da loja no iFood"
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                  />
                  <p className="text-xs text-gray-400">
                    O Gestor usa esse link para copiar os dados públicos da loja e tentar importar
                    o cardápio sem depender da integração oficial.
                  </p>
                </label>

                <button
                  type="button"
                  onClick={handleImportIfoodPublicLink}
                  disabled={isImportingIfoodLink || !ifoodPublicUrl.trim()}
                  className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <span className="inline-flex items-center gap-2">
                    {isImportingIfoodLink && <Loader2 size={16} className="animate-spin" />}
                    Copiar cardápio pelo link
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleCheckIfoodConnection}
                disabled={isCheckingIfoodConnection}
                className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <span className="inline-flex items-center gap-2">
                  {isCheckingIfoodConnection && <Loader2 size={16} className="animate-spin" />}
                  Testar conexão
                </span>
              </button>
              <button
                type="button"
                onClick={handleImportIfoodCatalog}
                disabled={isImportingIfoodCatalog || !ifoodIntegration.merchantId}
                className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <span className="inline-flex items-center gap-2">
                  {isImportingIfoodCatalog && <Loader2 size={16} className="animate-spin" />}
                  Importar catálogo do iFood
                </span>
              </button>
              <button
                type="button"
                onClick={handleSyncIfoodOrders}
                disabled={isSyncingIfoodOrders || !ifoodIntegration.merchantId}
                className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                <span className="inline-flex items-center gap-2">
                  {isSyncingIfoodOrders && <Loader2 size={16} className="animate-spin" />}
                  Sincronizar pedidos de teste
                </span>
              </button>
            </div>

            <div
              className={`mt-5 rounded-[22px] border px-4 py-4 ${
                ifoodConnectionCheck.status === "error"
                  ? "border-red-200 bg-red-50"
                  : ifoodConnectionCheck.status === "success"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-[var(--line)] bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">Diagnóstico rápido</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {ifoodConnectionCheck.status === "idle"
                      ? "Quando você testar a conexão, o sistema mostra aqui se a autenticação, a loja e o catálogo responderam corretamente."
                      : ifoodConnectionCheck.summary}
                  </p>
                </div>
                {ifoodConnectionCheck.checkedAt && (
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Última checagem: {formatSyncDate(ifoodConnectionCheck.checkedAt)}
                  </span>
                )}
              </div>

              {(ifoodConnectionCheck.merchantFound || ifoodConnectionCheck.catalogResolved) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-gray-700">
                    Credenciais: {ifoodConnectionCheck.status === "success" ? "ok" : "pendente"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-gray-700">
                    Loja: {ifoodConnectionCheck.merchantFound ? "localizada" : "não validada"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-gray-700">
                    Catálogo: {ifoodConnectionCheck.catalogResolved ? "pronto" : "aguardando"}
                  </span>
                </div>
              )}
            </div>

            <details className="mt-5 rounded-[22px] border border-[var(--line)] bg-white">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-gray-700">
                Configurações avançadas da integração
              </summary>
              <div className="border-t border-[var(--line)] px-4 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-gray-700">ID do catálogo</span>
                    <input
                      value={ifoodIntegration.catalogId}
                      onChange={(e) => updateIfoodIntegration("catalogId", e.target.value)}
                      placeholder="Catálogo principal do delivery"
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-bold text-gray-700">Etapa da integração</span>
                    <select
                      value={ifoodIntegration.status}
                      onChange={(e) =>
                        updateIfoodIntegration(
                          "status",
                          e.target.value as IfoodIntegrationState["status"],
                        )
                      }
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    >
                      <option value="disconnected">Desconectada</option>
                      <option value="configuring">Em configuração</option>
                      <option value="homologation">Em homologação</option>
                      <option value="connected">Conectada</option>
                    </select>
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-bold text-gray-700">Estratégia de sincronização</span>
                    <select
                      value={ifoodIntegration.syncMode}
                      onChange={(e) =>
                        updateIfoodIntegration(
                          "syncMode",
                          e.target.value as IfoodIntegrationState["syncMode"],
                        )
                      }
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    >
                      <option value="ifood_to_gestor">Importar do iFood para o Gestor</option>
                      <option value="gestor_to_ifood">Editar no Gestor e publicar no iFood</option>
                      <option value="bidirectional">Sincronização bidirecional</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3">
                    <span className="text-sm font-bold text-gray-700">Sincronizar catálogo</span>
                    <input
                      type="checkbox"
                      checked={ifoodIntegration.catalogSyncEnabled}
                      onChange={(e) => updateIfoodIntegration("catalogSyncEnabled", e.target.checked)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3">
                    <span className="text-sm font-bold text-gray-700">Receber pedidos</span>
                    <input
                      type="checkbox"
                      checked={ifoodIntegration.orderSyncEnabled}
                      onChange={(e) => updateIfoodIntegration("orderSyncEnabled", e.target.checked)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3">
                    <span className="text-sm font-bold text-gray-700">Importar imagens</span>
                    <input
                      type="checkbox"
                      checked={ifoodIntegration.importImages}
                      onChange={(e) => updateIfoodIntegration("importImages", e.target.checked)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </label>
                </div>

                <label className="mt-4 block space-y-2">
                  <span className="text-sm font-bold text-gray-700">Observações</span>
                  <textarea
                    value={ifoodIntegration.notes}
                    onChange={(e) => updateIfoodIntegration("notes", e.target.value)}
                    rows={3}
                    placeholder="Anote aqui detalhes da homologação, da loja teste ou do catálogo usado."
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </label>
              </div>
            </details>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleCheckIfoodConnection}
              disabled={isCheckingIfoodConnection}
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              <span className="inline-flex items-center gap-2">
                {isCheckingIfoodConnection && <Loader2 size={16} className="animate-spin" />}
                Testar conexão iFood
              </span>
            </button>
            <button
              type="button"
              onClick={handleImportIfoodCatalog}
              disabled={isImportingIfoodCatalog || !ifoodIntegration.merchantId}
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
              title={
                ifoodIntegration.merchantId
                  ? "Importa categorias e itens vendáveis do catálogo iFood para o Gestor."
                  : "Informe o ID do merchant do iFood para liberar a importação."
              }
            >
              <span className="inline-flex items-center gap-2">
                {isImportingIfoodCatalog && <Loader2 size={16} className="animate-spin" />}
                Importar catálogo do iFood
              </span>
            </button>
            <button
              type="button"
              onClick={handleSyncIfoodOrders}
              disabled={isSyncingIfoodOrders || !ifoodIntegration.merchantId}
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
              title={
                ifoodIntegration.merchantId
                  ? "Faz um polling manual dos eventos da loja e cria/atualiza os pedidos no Gestor."
                  : "Informe o ID do merchant para liberar a sincronização de pedidos."
              }
            >
              <span className="inline-flex items-center gap-2">
                {isSyncingIfoodOrders && <Loader2 size={16} className="animate-spin" />}
                Sincronizar pedidos de teste
              </span>
            </button>
            <button
              type="button"
              disabled
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-400"
              title="Próxima etapa: publicar atualizações de produtos, preços e status no iFood."
            >
              Enviar cardápio para o iFood
            </button>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          icon={<MapPin size={20} />}
          title="Taxas de entrega"
          description="Defina preço e tempo por distância."
          defaultOpen={false}
        >
          <div className="mt-6 space-y-3">
            {tiers.map((tier, index) => (
              <div key={index} className="grid items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Até quantos km
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={tier.distance}
                      onChange={(e) => updateTier(index, "distance", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 3"
                    />
                    <span className="text-sm font-bold text-gray-400">km</span>
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Tempo estimado
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <input
                      type="number"
                      min="0"
                      value={tier.time}
                      onChange={(e) => updateTier(index, "time", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 30"
                    />
                    <span className="text-sm font-bold text-gray-400">min</span>
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Valor da entrega
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.price}
                      onChange={(e) => updateTier(index, "price", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 5,00"
                    />
                  </div>
                </label>

                <button onClick={() => removeTier(index)} className="rounded-xl p-3 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button onClick={addTier} className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-600">
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Adicionar faixa
              </span>
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          icon={<Clock size={20} />}
          title="Horários de funcionamento"
          description="Marque os dias e ajuste a janela de atendimento."
          defaultOpen={false}
        >
          <div className="mt-6 space-y-3">
            {schedule.map((item, index) => (
              <div key={item.day_id} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:flex-row md:items-center md:justify-between">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={item.is_open} onChange={(e) => handleTimeChange(index, "is_open", e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                  <span className={`text-sm font-bold ${item.is_open ? "text-gray-950" : "text-gray-400"}`}>{item.day_label}</span>
                </label>
                {item.is_open && (
                  <div className="flex items-center gap-2">
                    <input type="time" value={item.open_time} onChange={(e) => handleTimeChange(index, "open_time", e.target.value)} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]" />
                    <span className="text-sm text-gray-400">as</span>
                    <input type="time" value={item.close_time} onChange={(e) => handleTimeChange(index, "close_time", e.target.value)} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--brand)]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          icon={<Smartphone size={20} />}
          title="Impressão térmica"
          description="Ajuste largura, tamanho e espessura da fonte do cupom."
          defaultOpen={false}
        >
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-bold text-gray-700">Largura do papel</span>
              <select
                value={printerWidth}
                onChange={(e) => setPrinterWidth(Number(e.target.value))}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
              >
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-gray-700">Tamanho da fonte</span>
              <input
                type="number"
                min="9"
                max="18"
                value={printerFontSize}
                onChange={(e) => setPrinterFontSize(Number(e.target.value) || 12)}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-gray-700">Espessura da fonte</span>
              <select
                value={printerFontWeight}
                onChange={(e) => setPrinterFontWeight(Number(e.target.value))}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
              >
                <option value={500}>Média</option>
                <option value={700}>Forte</option>
                <option value={800}>Extra forte</option>
                </select>
            </label>
          </div>

          <label className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <span className="text-sm font-bold text-gray-700">Imprimir automaticamente ao aceitar</span>
            <input
              type="checkbox"
              checked={printerAutoPrint}
              onChange={(e) => setPrinterAutoPrint(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
          </label>

          <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Preview rápido</p>
            <div
              className="mt-3 rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-4 text-gray-800"
              style={{ fontFamily: "'Courier New', monospace", fontSize: `${printerFontSize}px`, fontWeight: printerFontWeight }}
            >
              <p className="text-center">{name || "Sua loja"}</p>
              <p className="mt-2 text-center">Pedido #0042</p>
              <p className="mt-3">1x Smash Burger ........ R$ 29,90</p>
              <p>Entrega ..................... R$ 6,00</p>
              <p className="mt-2">Total ....................... R$ 35,90</p>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          icon={<Smartphone size={20} />}
          title="Conexão WhatsApp"
          description="Acompanhe o status do robô e recarregue o QR code quando precisar."
          defaultOpen={false}
        >
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_220px]">
            <div className="rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-gray-700">Status:</span>
                {wppStatus === "conectado" && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Conectado</span>}
                {wppStatus === "aguardando_qr" && <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">Aguardando leitura</span>}
                {wppStatus === "iniciando" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Iniciando</span>}
                {(wppStatus === "desconectado" || wppStatus === "erro" || !wppStatus) && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Desconectado</span>}
                <button onClick={handleRestartWpp} disabled={isRestarting} className="ml-auto rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-60">
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw size={13} className={isRestarting ? "animate-spin" : ""} />
                    Reiniciar
                  </span>
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                Use esta área para monitorar a conexão do seu número e renovar o QR Code quando necessário.
              </p>
            </div>

            <div className="flex items-center justify-center rounded-[24px] border border-dashed border-[var(--line)] bg-white p-4">
              {wppStatus === "aguardando_qr" && wppQrCode ? (
                <img src={wppQrCode} alt="QR Code WhatsApp" className="h-full w-full object-contain" />
              ) : wppStatus === "conectado" ? (
                <div className="text-center text-emerald-600">
                  <CheckCircle className="mx-auto" size={44} />
                  <p className="mt-2 text-sm font-bold">Pronto para enviar</p>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <QrCode className="mx-auto" size={44} />
                  <p className="mt-2 text-sm font-medium">Aguardando API</p>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {cropSource && cropTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-gray-950">{cropTarget === "logo" ? "Ajustar logo" : "Ajustar banner"}</h3>
                <p className="mt-1 text-sm text-gray-500">Posicione a imagem para que ela fique no formato ideal da vitrine.</p>
              </div>
              <button onClick={closeCropper} className="rounded-full border border-[var(--line)] p-2 text-gray-500">
                <X size={16} />
              </button>
            </div>

            <div className="relative mt-5 h-[360px] overflow-hidden rounded-[24px] bg-gray-950">
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <label className="flex-1">
                <span className="mb-2 block text-sm font-bold text-gray-700">Zoom da imagem</span>
                <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--brand)]" />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={closeCropper} className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm font-bold text-gray-600">
                  Cancelar
                </button>
                <button onClick={handleConfirmCrop} disabled={uploading} className="brand-gradient rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                  <span className="inline-flex items-center gap-2">
                    {uploading ? <Loader2 className="animate-spin" size={16} /> : <Scissors size={16} />}
                    Aplicar recorte
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



