"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  CheckCircle,
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
import { CollapsibleSection, FieldHint, SettingsGroupHeading } from "./SettingsSections";
import {
  DEFAULT_IFOOD_CONNECTION_CHECK,
  DEFAULT_IFOOD_INTEGRATION,
  DEFAULT_SCHEDULE,
  DEFAULT_STOREFRONT_THEME,
  IFOOD_HOMOLOGATION_SHIFTS,
} from "./constants";
import type {
  DeliveryTier,
  IfoodConnectionCheckState,
  IfoodIntegrationState,
  IfoodMerchantSnapshot,
  StorefrontTheme,
  WorkHour,
} from "./types";
import {
  compactJson,
  firstFromIfoodPayload,
  getCroppedImg,
  hexToRgba,
  listFromIfoodPayload,
  normalizeWorkHours,
  readJsonResponse,
} from "./utils";
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
  const [isPreparingIfoodCatalog, setIsPreparingIfoodCatalog] = useState(false);
  const [isMutatingIfoodCatalog, setIsMutatingIfoodCatalog] = useState(false);
  const [isCheckingIfoodConnection, setIsCheckingIfoodConnection] = useState(false);
  const [isSyncingIfoodOrders, setIsSyncingIfoodOrders] = useState(false);
  const [isImportingIfoodLink, setIsImportingIfoodLink] = useState(false);
  const [isLoadingIfoodMerchant, setIsLoadingIfoodMerchant] = useState(false);
  const [isCreatingIfoodPause, setIsCreatingIfoodPause] = useState(false);
  const [isSavingIfoodHours, setIsSavingIfoodHours] = useState(false);
  const [ifoodIntegration, setIfoodIntegration] =
    useState<IfoodIntegrationState>(DEFAULT_IFOOD_INTEGRATION);
  const [ifoodConnectionCheck, setIfoodConnectionCheck] = useState<IfoodConnectionCheckState>(
    DEFAULT_IFOOD_CONNECTION_CHECK,
  );
  const [ifoodMerchantSnapshot, setIfoodMerchantSnapshot] =
    useState<IfoodMerchantSnapshot | null>(null);
  const [ifoodPauseDescription, setIfoodPauseDescription] =
    useState("Pausa de homologação Gestor Delivery");
  const [ifoodPauseStart, setIfoodPauseStart] = useState("");
  const [ifoodPauseEnd, setIfoodPauseEnd] = useState("");
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
    ensureIfoodPauseDefaults();
  }, []);

  useEffect(() => {
    const checkWppStatus = async () => {
      try {
        const res = await fetch("/api/whatsapp-bot/status", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 503) {
            setWppStatus("nao_configurado");
            setWppQrCode("");
            return;
          }

          throw new Error(data.error || "Falha ao consultar API WhatsApp.");
        }

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
        currentError?.message?.includes("storefront_") || ("code" in (error || {}) && error?.code === "42703");
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
      const response = await fetch("/api/whatsapp-bot/restart", { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Falha ao reiniciar API WhatsApp.";
        throw new Error(message);
      }
    } catch (error) {
      console.error(error);
      showToast({
        title: "Não foi possível reiniciar",
        description:
          error instanceof Error
            ? error.message
            : "Falha ao reiniciar API WhatsApp.",
        tone: "error",
      });
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

  const handleTimeChange = <K extends keyof WorkHour>(index: number, field: K, value: WorkHour[K]) => {
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

  const callIfoodMerchantApi = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/integrations/ifood/merchant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId,
        merchantId: ifoodIntegration.merchantId,
        ...payload,
      }),
    });

    const result = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível executar a operação Merchant.");
    }

    return result;
  };

  const refreshIfoodMerchantSnapshot = async () => {
    if (!restaurantId) return;

    setIsLoadingIfoodMerchant(true);
    try {
      const result = await callIfoodMerchantApi({ action: "overview" });
      setIfoodMerchantSnapshot({
        merchants: result.merchants,
        details: result.details,
        status: result.status,
        interruptions: result.interruptions,
        openingHours: result.openingHours,
        checkedAt: new Date().toISOString(),
      });

      showToast({
        title: "Merchant consultado",
        description: "Lojas, status, pausas e horários foram atualizados.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Falha ao consultar Merchant",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar os dados Merchant no iFood.",
        tone: "error",
      });
    } finally {
      setIsLoadingIfoodMerchant(false);
    }
  };

  const ensureIfoodPauseDefaults = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60 * 1000);
    const end = new Date(now.getTime() + 35 * 60 * 1000);

    setIfoodPauseStart(start.toISOString().slice(0, 16));
    setIfoodPauseEnd(end.toISOString().slice(0, 16));
  };

  const handleCreateIfoodPause = async () => {
    if (!restaurantId) return;

    setIsCreatingIfoodPause(true);
    try {
      await callIfoodMerchantApi({
        action: "create_interruption",
        interruption: {
          description: ifoodPauseDescription,
          start: new Date(ifoodPauseStart).toISOString(),
          end: new Date(ifoodPauseEnd).toISOString(),
        },
      });

      showToast({
        title: "Pausa criada no iFood",
        description: "A interrupção foi enviada. Pode levar alguns segundos para refletir no portal.",
        tone: "success",
      });

      await refreshIfoodMerchantSnapshot();
    } catch (error) {
      showToast({
        title: "Falha ao criar pausa",
        description:
          error instanceof Error ? error.message : "Não foi possível criar a pausa no iFood.",
        tone: "error",
      });
    } finally {
      setIsCreatingIfoodPause(false);
    }
  };

  const handleDeleteIfoodPause = async (interruptionId: string) => {
    if (!restaurantId || !interruptionId) return;

    setIsLoadingIfoodMerchant(true);
    try {
      await callIfoodMerchantApi({
        action: "delete_interruption",
        interruptionId,
      });

      showToast({
        title: "Pausa removida",
        description: "A interrupção foi removida no iFood.",
        tone: "success",
      });

      await refreshIfoodMerchantSnapshot();
    } catch (error) {
      showToast({
        title: "Falha ao remover pausa",
        description:
          error instanceof Error ? error.message : "Não foi possível remover a pausa no iFood.",
        tone: "error",
      });
    } finally {
      setIsLoadingIfoodMerchant(false);
    }
  };

  const handleApplyIfoodHomologationHours = async () => {
    if (!restaurantId) return;

    setIsSavingIfoodHours(true);
    try {
      await callIfoodMerchantApi({
        action: "set_opening_hours",
        shifts: IFOOD_HOMOLOGATION_SHIFTS,
      });

      showToast({
        title: "Horários enviados ao iFood",
        description: "Sábado e domingo foram configurados conforme o checklist de homologação.",
        tone: "success",
      });

      await refreshIfoodMerchantSnapshot();
    } catch (error) {
      showToast({
        title: "Falha ao salvar horários",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar os horários no iFood.",
        tone: "error",
      });
    } finally {
      setIsSavingIfoodHours(false);
    }
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

      const result = await readJsonResponse(response);

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

  const handleManageIfoodCatalog = async (
    action: "prepare_homologation" | "mutate_homologation",
  ) => {
    if (!restaurantId) return;

    const isMutation = action === "mutate_homologation";
    const setLoading = isMutation ? setIsMutatingIfoodCatalog : setIsPreparingIfoodCatalog;
    setLoading(true);

    try {
      const response = await fetch("/api/integrations/ifood/catalog/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurantId, action }),
      });

      const result = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível publicar o catálogo no iFood.");
      }

      showToast({
        title: isMutation ? "Cenário Catalog alterado" : "Cenário Catalog preparado",
        description: isMutation
          ? "Produto alterado e segundo complemento pausado no iFood."
          : `Categoria ${result.summary?.categoryName || "Teste Homologacao"} e item de teste enviados ao iFood.`,
        tone: "success",
      });

      fetchSettings();
    } catch (error) {
      showToast({
        title: "Falha no Catalog iFood",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível executar o cenário Catalog agora.",
        tone: "error",
      });
    } finally {
      setLoading(false);
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

      const result = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível sincronizar os pedidos do iFood.");
      }

      showToast({
        title: "Pedidos iFood sincronizados",
        description:
          Number(result.summary?.eventsReceived || 0) > 0
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
        <SettingsGroupHeading
          eyebrow="Loja"
          title="Loja e vitrine"
          description="Dados públicos, identidade visual e aparência que o cliente vê antes de fazer o pedido."
        />
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

        <SettingsGroupHeading
          eyebrow="Integrações"
          title="Canais conectados"
          description="Conexões externas que trabalham em segundo plano para importar catálogo, receber pedidos e manter a operação sincronizada."
        />
        <CollapsibleSection
          icon={<ArrowDownUp size={20} />}
          title="Canal iFood"
          description="Receba pedidos e mantenha catálogo e loja sincronizados sem expor detalhes técnicos para a operação."
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

            <div className="mt-5 grid gap-4">
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
                  Atualizar catálogo
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
                  Buscar pedidos agora
                </span>
              </button>
            </div>

            <details
              className={`mt-5 rounded-[22px] border ${
                ifoodConnectionCheck.status === "error"
                  ? "border-red-200 bg-red-50"
                  : ifoodConnectionCheck.status === "success"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-[var(--line)] bg-white"
              }`}
            >
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-gray-700">
                Diagnóstico da conexão
              </summary>
              <div className="border-t border-[var(--line)] px-4 py-4">
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
            </details>

            <details className="mt-5 rounded-[22px] border border-[var(--line)] bg-white">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-gray-700">
                Ferramentas de homologação Merchant
              </summary>
              <div className="border-t border-[var(--line)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black text-gray-950">Homologação Merchant</p>
                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      Consulte lojas, detalhes, disponibilidade, pausas e horários para gravar os
                      cenários exigidos pelo iFood.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshIfoodMerchantSnapshot}
                    disabled={isLoadingIfoodMerchant}
                    className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isLoadingIfoodMerchant ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                      Consultar Merchant
                    </span>
                  </button>
                </div>

              {ifoodMerchantSnapshot?.checkedAt && (
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                  Última consulta Merchant: {formatSyncDate(ifoodMerchantSnapshot.checkedAt)}
                </p>
              )}

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Lojas vinculadas
                  </p>
                  <p className="mt-2 text-2xl font-black text-gray-950">
                    {listFromIfoodPayload(ifoodMerchantSnapshot?.merchants).length}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Disponibilidade
                  </p>
                  {(() => {
                    const status = firstFromIfoodPayload(ifoodMerchantSnapshot?.status);
                    return (
                      <>
                        <p className="mt-2 text-sm font-black text-gray-950">
                          {String(status?.state || status?.status || "Não consultada")}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {typeof status?.available === "boolean"
                            ? status.available
                              ? "available: true"
                              : "available: false"
                            : "available pendente"}
                        </p>
                        {status?.message?.subtitle && (
                          <p className="mt-2 text-xs leading-5 text-gray-500">
                            {status.message.subtitle}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Pausas ativas/futuras
                  </p>
                  <p className="mt-2 text-2xl font-black text-gray-950">
                    {listFromIfoodPayload(ifoodMerchantSnapshot?.interruptions).length}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-sm font-black text-gray-950">Interrupção na loja</p>
                  <div className="mt-3 grid gap-3">
                    <input
                      value={ifoodPauseDescription}
                      onChange={(e) => setIfoodPauseDescription(e.target.value)}
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                      placeholder="Descrição da pausa"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                          Início
                        </span>
                        <input
                          type="datetime-local"
                          value={ifoodPauseStart}
                          onChange={(e) => setIfoodPauseStart(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                          Fim
                        </span>
                        <input
                          type="datetime-local"
                          value={ifoodPauseEnd}
                          onChange={(e) => setIfoodPauseEnd(e.target.value)}
                          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCreateIfoodPause}
                        disabled={
                          isCreatingIfoodPause ||
                          !ifoodIntegration.merchantId ||
                          !ifoodPauseDescription ||
                          !ifoodPauseStart ||
                          !ifoodPauseEnd
                        }
                        className="rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        <span className="inline-flex items-center gap-2">
                          {isCreatingIfoodPause && <Loader2 size={16} className="animate-spin" />}
                          Criar pausa
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={ensureIfoodPauseDefaults}
                        className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                      >
                        Recalcular janela
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {listFromIfoodPayload(ifoodMerchantSnapshot?.interruptions).length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm text-gray-500">
                        Nenhuma pausa listada ainda.
                      </p>
                    ) : (
                      listFromIfoodPayload(ifoodMerchantSnapshot?.interruptions).map((pause, index) => {
                        const interruptionId = String(pause.id || pause.interruptionId || "");
                        return (
                          <div
                            key={interruptionId || index}
                            className="rounded-2xl border border-[var(--line)] bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-gray-900">
                                  {pause.description || pause.reason || `Pausa ${index + 1}`}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {String(pause.start || pause.startDate || "")} até{" "}
                                  {String(pause.end || pause.endDate || "")}
                                </p>
                              </div>
                              {interruptionId && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteIfoodPause(interruptionId)}
                                  className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  title="Remover pausa"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-sm font-black text-gray-950">Horário de funcionamento</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Aplica exatamente o cenário Merchant do suporte: sábado 10:00-19:00 e domingo
                    09:00-12:00, 13:00-16:00, 17:00-23:00.
                  </p>
                  <button
                    type="button"
                    onClick={handleApplyIfoodHomologationHours}
                    disabled={isSavingIfoodHours || !ifoodIntegration.merchantId}
                    className="mt-3 rounded-2xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSavingIfoodHours && <Loader2 size={16} className="animate-spin" />}
                      Aplicar horários de homologação
                    </span>
                  </button>

                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                      Turnos retornados pelo iFood
                    </p>
                    <div className="mt-3 space-y-2">
                      {listFromIfoodPayload(ifoodMerchantSnapshot?.openingHours).length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum turno consultado ainda.</p>
                      ) : (
                        listFromIfoodPayload(ifoodMerchantSnapshot?.openingHours).map(
                          (shift, index) => (
                            <div
                              key={`${shift.dayOfWeek}-${shift.start}-${index}`}
                              className="rounded-xl bg-[#fcfaf7] px-3 py-2 text-sm text-gray-700"
                            >
                              <span className="font-bold">{shift.dayOfWeek}</span>{" "}
                              {shift.start} por {shift.duration} min
                            </div>
                          ),
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border border-[var(--line)] bg-[#fcfaf7]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-gray-700">
                  Dados brutos para conferência da gravação
                </summary>
                <pre className="max-h-96 overflow-auto border-t border-[var(--line)] p-4 text-xs leading-5 text-gray-600">
                  {compactJson(ifoodMerchantSnapshot)}
                </pre>
              </details>
              </div>
            </details>

            <details className="mt-5 rounded-[22px] border border-[var(--line)] bg-white">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold text-gray-700">
                Configurações avançadas da integração
              </summary>
              <div className="border-t border-[var(--line)] px-4 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-gray-700">Nome da loja no iFood</span>
                    <input
                      value={ifoodIntegration.merchantName}
                      onChange={(e) => updateIfoodIntegration("merchantName", e.target.value)}
                      placeholder="Ex.: Loja teste do iFood"
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
                    />
                  </label>

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
                        Atalho opcional para copiar dados públicos quando a integração oficial ainda não está pronta.
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

                <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4">
                  <p className="text-sm font-black text-gray-950">Ações de homologação</p>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Use apenas durante testes ou gravações solicitadas pelo iFood.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleManageIfoodCatalog("prepare_homologation")}
                      disabled={isPreparingIfoodCatalog || !ifoodIntegration.merchantId}
                      className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
                      title="Cria categoria, produto, grupo e complementos exigidos no cenário de homologação Catalog."
                    >
                      <span className="inline-flex items-center gap-2">
                        {isPreparingIfoodCatalog && <Loader2 size={16} className="animate-spin" />}
                        Preparar Catalog
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManageIfoodCatalog("mutate_homologation")}
                      disabled={isMutatingIfoodCatalog || !ifoodIntegration.merchantId}
                      className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
                      title="Altera o produto de teste e pausa o segundo complemento no iFood."
                    >
                      <span className="inline-flex items-center gap-2">
                        {isMutatingIfoodCatalog && <Loader2 size={16} className="animate-spin" />}
                        Alterar/pausar Catalog
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </CollapsibleSection>


        <SettingsGroupHeading
          eyebrow="Operação"
          title="Regras de atendimento"
          description="Entrega, horários e impressão usados no fluxo diário da loja."
        />
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

        <SettingsGroupHeading
          eyebrow="Automação"
          title="Mensageria"
          description="Serviços auxiliares usados para avisos automáticos aos clientes."
        />
        <CollapsibleSection
          icon={<Smartphone size={20} />}
          title="WhatsApp automático"
          description="Status do envio automático de mensagens. Use somente quando precisar reconectar o número."
          defaultOpen={false}
        >
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_220px]">
            <div className="rounded-[24px] border border-[var(--line)] bg-[#fcfaf7] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-gray-700">Status:</span>
                {wppStatus === "conectado" && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Conectado</span>}
                {wppStatus === "aguardando_qr" && <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">Aguardando leitura</span>}
                {wppStatus === "iniciando" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Iniciando</span>}
                {wppStatus === "nao_configurado" && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">API não configurada</span>}
                {(wppStatus === "desconectado" || wppStatus === "erro" || !wppStatus) && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Desconectado</span>}
                <button onClick={handleRestartWpp} disabled={isRestarting || wppStatus === "nao_configurado"} className="ml-auto rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-60">
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw size={13} className={isRestarting ? "animate-spin" : ""} />
                    Reiniciar
                  </span>
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                {wppStatus !== "nao_configurado"
                  ? "Use esta área para monitorar a conexão do seu número e renovar o QR Code quando necessário."
                  : "Configure WHATSAPP_BOT_API_URL no ambiente do servidor para monitorar a conexão do seu número."}
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
              ) : wppStatus === "nao_configurado" ? (
                <div className="text-center text-gray-400">
                  <QrCode className="mx-auto" size={44} />
                  <p className="mt-2 text-sm font-medium">API não configurada</p>
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



