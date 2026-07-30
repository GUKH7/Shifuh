"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  Filter,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  WalletCards,
  XCircle,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { getStoreStatus } from "@/features/storefront/store-summary";
import { useToast } from "@/components/ui/toast-provider";
import { OrderStatusBadge } from "@/components/ui/order-status-badge";
import { LiveStatusDot } from "@/components/ui/live-status-dot";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminEmptyState, AdminErrorState } from "@/components/ui/admin-page-states";
import { OrdersSkeleton } from "./OrdersSkeleton";
import { OrdersDatePicker } from "./OrdersDatePicker";
import "./orders-responsive.css";
import type { IfoodCancellationReason, IfoodEventAudit, Order, OrderItem } from "./types";
import {
  STATUS_FILTERS,
  formatDate,
  formatDateTime,
  formatDisplayNumber,
  formatIfoodCancellationStatus,
  formatIfoodOrderType,
  formatIfoodPayment,
  formatIfoodTiming,
  formatPrice,
  formatTime,
  calculateCashChange,
  getAddonLabel,
  getAddonPrice,
  getIfoodBenefitAmount,
  getIfoodBenefitLabel,
  getIfoodCancellation,
  getIfoodMeta,
  getStatusLabel,
  isIfoodOrder,
  listIfoodBenefits,
  normalizeCancellationReasons,
  playNewOrderChime,
} from "./utils";

type RestaurantConfig = {
  id: string;
  name?: string | null;
  printer_auto_print?: boolean | null;
  printer_width?: number | null;
  printer_font_size?: number | null;
  printer_font_weight?: number | null;
  work_hours?: unknown;
};

type OrderStatus = Order["status"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type ChannelFilter = "all" | "ifood" | "whatsapp" | "counter";
type FulfillmentFilter = "all" | "delivery" | "pickup";
type IfoodAction =
  | "confirm"
  | "dispatch"
  | "ready_to_pickup"
  | "cancellation_reasons"
  | "request_cancellation";

const STATUS_META: Record<OrderStatus, {
  icon: ReactNode;
}> = {
  pending: {
    icon: <ShoppingBag size={18} />,
  },
  preparing: {
    icon: <Package size={18} />,
  },
  delivering: {
    icon: <Bike size={18} />,
  },
  done: {
    icon: <CheckCircle2 size={18} />,
  },
  canceled: {
    icon: <XCircle size={18} />,
  },
};

const STAT_CARDS: Array<{
  id: OrderStatus;
  title: string;
  tone: string;
}> = [
  { id: "pending", title: "Pendentes", tone: "bg-orange-50 text-orange-600" },
  { id: "preparing", title: "Em preparo", tone: "bg-slate-100 text-slate-600" },
  { id: "delivering", title: "Em rota", tone: "bg-blue-50 text-blue-600" },
  { id: "done", title: "Concluídos", tone: "bg-emerald-50 text-emerald-600" },
  { id: "canceled", title: "Cancelados", tone: "bg-red-50 text-red-600" },
];

const LOCAL_CANCELLATION_REASONS: IfoodCancellationReason[] = [
  { code: "ITEM_UNAVAILABLE", description: "Um ou mais itens ficaram indisponíveis" },
  { code: "DELIVERY_UNAVAILABLE", description: "Não foi possível realizar a entrega" },
  { code: "STORE_OPERATION", description: "A loja não conseguirá atender o pedido" },
  { code: "CUSTOMER_REQUEST", description: "Cancelamento solicitado pelo cliente" },
  { code: "OTHER", description: "Outro motivo" },
];

function getRelativeOrderTime(dateStr: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (minutes < 1) return "Agora há pouco";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  return formatDate(dateStr);
}

function formatDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getSelectedDateRange(dateValue: string) {
  const startDate = new Date(`${dateValue}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function formatSelectedDateLabel(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const today = formatDateInputValue();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDateInputValue(yesterdayDate);
  const shortDate = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  if (dateValue === today) return `Hoje, ${shortDate}`;
  if (dateValue === yesterday) return `Ontem, ${shortDate}`;

  return date
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    .replace(".", "");
}

function getChannelLabel(order: Order) {
  if (isIfoodOrder(order)) return "iFood";
  if (formatIfoodOrderType(order) === "Retirada") return "Balcão";
  return "WhatsApp";
}

function getFulfillmentLabel(order: Order) {
  if (order.address?.fulfillment_type === "pickup") return "Retirada";
  return formatIfoodOrderType(order) === "Retirada" ? "Retirada" : "Delivery";
}

function isPickupOrder(order: Order) {
  return order.address?.fulfillment_type === "pickup" ||
    (isIfoodOrder(order) && String(getIfoodMeta(order).orderType).toUpperCase() === "TAKEOUT");
}

function getPrimaryActionLabel(order: Order) {
  if (order.status === "pending") return "Aceitar pedido";
  if (order.status === "preparing") {
    return isPickupOrder(order)
      ? "Pronto para retirada"
      : "Despachar pedido";
  }
  if (order.status === "delivering") return "Marcar concluído";
  return "";
}

function getCompactPrimaryActionLabel(order: Order) {
  if (order.status === "pending") return "Aceitar";
  if (order.status === "preparing") {
    return isPickupOrder(order)
      ? "Pronto"
      : "Despachar";
  }
  if (order.status === "delivering") return "Concluir";
  return "";
}

function getOperationalErrorMessage(error: unknown, fallback = "Tente novamente em instantes.") {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("ifood api") ||
    normalized.includes("bad request") ||
    normalized.includes("request failed") ||
    normalized.includes("unexpected end") ||
    normalized.includes("json")
  ) {
    return "A integração não aceitou essa ação agora. Atualize os pedidos e tente novamente.";
  }

  return message || fallback;
}

export default function OrdersPage() {
  const router = useRouter();
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => formatDateInputValue());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig | null>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const lastSeenOrderIdRef = useRef("");
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [busyIfoodAction, setBusyIfoodAction] = useState("");
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState("");
  const [cancellationModalOrder, setCancellationModalOrder] = useState<Order | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<IfoodCancellationReason[]>([]);
  const [selectedCancellationCode, setSelectedCancellationCode] = useState("");
  const [cancellationReasonText, setCancellationReasonText] = useState("");
  const [ifoodEventsByOrder, setIfoodEventsByOrder] = useState<Record<string, IfoodEventAudit[]>>({});
  const [loadingIfoodEvents, setLoadingIfoodEvents] = useState<Record<string, boolean>>({});
  const [expandedIfoodEvent, setExpandedIfoodEvent] = useState("");
  const [expandedTechnicalOrders, setExpandedTechnicalOrders] = useState<string[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isChimeEnabled, setIsChimeEnabled] = useState(false);
  const [storeClock, setStoreClock] = useState(() => new Date());
  const { showToast } = useToast();
  const isCurrentDate = selectedDate === formatDateInputValue();
  const selectedDateLabel = formatSelectedDateLabel(selectedDate);
  const storeStatus = useMemo(
    () => getStoreStatus(restaurantConfig?.work_hours, storeClock),
    [restaurantConfig?.work_hours, storeClock],
  );
  const storeStatusClasses = {
    open: "border-emerald-200 bg-emerald-50 text-emerald-700",
    closing: "border-amber-200 bg-amber-50 text-amber-700",
    closed: "border-red-200 bg-red-50 text-red-700",
  }[storeStatus.tone];
  const storeStatusDotClass = {
    open: "text-emerald-500",
    closing: "text-amber-500",
    closed: "text-red-500",
  }[storeStatus.tone];

  useEffect(() => {
    setIsChimeEnabled(window.localStorage.getItem("orders-chime-enabled") === "true");
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setStoreClock(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setExpandedOrders([]);
    setExpandedTechnicalOrders([]);
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    if (!restaurantId || !isCurrentDate) return;

    const ordersChannel = supabase
      .channel(`orders-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT" && payload.new?.id && payload.new.id !== lastSeenOrderIdRef.current) {
            lastSeenOrderIdRef.current = String(payload.new.id);
            const display = String(payload.new.display_number || 0).padStart(4, "0");
            if (isChimeEnabled) {
              playNewOrderChime();
            }
            showToast({
              title: "Novo pedido recebido",
              description: isChimeEnabled
                ? `Pedido #${display === "0000" ? String(payload.new.id).slice(0, 4) : display} entrou na fila da operação.`
                : `Pedido #${display === "0000" ? String(payload.new.id).slice(0, 4) : display} entrou na fila. Ative a campainha para ouvir os proximos.`,
              tone: "success",
            });
          }

          await fetchOrders(false);
        },
      )
      .subscribe();

    const itemsChannel = supabase
      .channel(`order-items-live-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
        },
        async () => {
          await fetchOrders(false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChimeEnabled, isCurrentDate, restaurantId, showToast, supabase]);

  useEffect(() => {
    if (!restaurantId || !isCurrentDate) return;

    let isRunning = false;
    let isCancelled = false;

    const syncIfoodOrders = async () => {
      if (isRunning) return;
      isRunning = true;

      try {
        const response = await fetch("/api/integrations/ifood/orders/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ restaurantId }),
        });

        if (response.ok && !isCancelled) {
          await fetchOrders(false);
        }
      } catch (error) {
        console.warn("Falha ao sincronizar pedidos iFood automaticamente:", error);
      } finally {
        isRunning = false;
      }
    };

    void syncIfoodOrders();
    const intervalId = window.setInterval(syncIfoodOrders, 10000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentDate, restaurantId]);

  useEffect(() => {
    if (!restaurantId || !isCurrentDate) return;

    const refreshOrders = () => {
      void fetchOrders(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshOrders();
    };

    const intervalId = window.setInterval(refreshOrders, 12000);
    window.addEventListener("focus", refreshOrders);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOrders);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // O polling funciona como contingência quando o websocket do Realtime é interrompido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentDate, restaurantId]);

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { restaurant: resto, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!resto) {
        setErrorMsg("Não foi possível localizar a loja.");
        return;
      }

      setRestaurantConfig(resto);
      setRestaurantId(resto.id);

      const { start, end } = getSelectedDateRange(selectedDate);
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, scheduled_for, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", resto.id)
        .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
        .or(`and(created_at.gte.${start},created_at.lt.${end}),and(scheduled_for.gte.${start},scheduled_for.lt.${end})`)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      type OrderRow = Omit<Order, "items"> & { order_items?: Order["items"] | null };
      const mappedOrders = ((data || []) as OrderRow[]).map((order) => ({
        ...order,
        items: order.order_items || [],
      })) as Order[];

      setOrders(mappedOrders);

      if (mappedOrders.length > 0 && !lastSeenOrderIdRef.current) {
        lastSeenOrderIdRef.current = String(mappedOrders[0].id);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexão.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const updateStatus = async (order: Order, newStatus: OrderStatus, cancellationReason = "") => {
    setStatusUpdatingOrderId(order.id);
    setOrders((prev) =>
      prev.map((current) => (current.id === order.id ? { ...current, status: newStatus } : current)),
    );

    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
          cancellationReason: newStatus === "canceled" ? cancellationReason : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast({
          title: "Não foi possível atualizar o pedido",
          description: result.error || "Tente novamente em instantes.",
          tone: "error",
        });
        void fetchOrders();
        return false;
      }

      showToast({
        title: "Status atualizado",
        description: result.notification?.sent
          ? `Pedido #${formatDisplayNumber(order)} agora está como ${getStatusLabel(newStatus).toLowerCase()} e o cliente foi avisado.`
          : `Pedido #${formatDisplayNumber(order)} agora está como ${getStatusLabel(newStatus).toLowerCase()}.`,
        tone: "success",
      });

      if (result.notification && !result.notification.sent && !result.notification.skipped) {
        showToast({
          title: "WhatsApp não enviado",
          description: result.notification.error || "Confira a configuração da API do robô.",
          tone: "error",
        });
      }

      if (newStatus === "preparing" && restaurantConfig?.printer_auto_print) {
        setTimeout(() => handlePrint({ ...order, status: newStatus }), 150);
      }
      return true;
    } catch (error) {
      showToast({
        title: "Não foi possível atualizar o pedido",
        description: getOperationalErrorMessage(error),
        tone: "error",
      });
      void fetchOrders();
      return false;
    } finally {
      setStatusUpdatingOrderId("");
    }
  };

  const enableChime = () => {
    const played = playNewOrderChime();

    if (!played) {
      showToast({
        title: "Campainha bloqueada",
        description: "Clique novamente ou confira a permissão de som do navegador.",
        tone: "error",
      });
      return;
    }

    window.localStorage.setItem("orders-chime-enabled", "true");
    setIsChimeEnabled(true);
    showToast({
      title: "Campainha ativada",
      description: "Novos pedidos vão tocar um aviso sonoro nesta tela.",
      tone: "success",
    });
  };

  const runIfoodAction = async (
    order: Order,
    action: IfoodAction,
    options: Record<string, unknown> = {},
  ) => {
    const busyKey = `${order.id}:${action}`;
    setBusyIfoodAction(busyKey);

    try {
      const response = await fetch("/api/integrations/ifood/orders/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          action,
          ...options,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível executar a ação no iFood.");
      }

      if (action !== "cancellation_reasons") {
        showToast({
          title: "Pedido atualizado",
          description: `Pedido #${formatDisplayNumber(order)} foi atualizado com sucesso.`,
          tone: "success",
        });
      }

      await fetchOrders(false);
      return result;
    } catch (error) {
      showToast({
        title: "Não foi possível atualizar o pedido",
        description: getOperationalErrorMessage(error),
        tone: "error",
      });
      return null;
    } finally {
      setBusyIfoodAction("");
    }
  };

  const handlePrimaryAction = async (order: Order) => {
    if (order.status === "pending") {
      if (isIfoodOrder(order)) {
        await runIfoodAction(order, "confirm");
      } else {
        await updateStatus(order, "preparing");
      }
      return;
    }

    if (order.status === "preparing") {
      if (isIfoodOrder(order) && String(getIfoodMeta(order).orderType).toUpperCase() === "TAKEOUT") {
        await runIfoodAction(order, "ready_to_pickup");
      } else if (order.address?.fulfillment_type === "pickup") {
        await updateStatus(order, "done");
      } else if (isIfoodOrder(order)) {
        await runIfoodAction(order, "dispatch");
      } else {
        await updateStatus(order, "delivering");
      }
      return;
    }

    if (order.status === "delivering") {
      await updateStatus(order, "done");
    }
  };

  const handleRequestIfoodCancellation = async (order: Order) => {
    const reasonsResult = await runIfoodAction(order, "cancellation_reasons");
    const reasons = normalizeCancellationReasons(reasonsResult);
    const firstReason = reasons[0];

    if (!firstReason) {
      showToast({
        title: "Sem motivos disponiveis",
        description: "O iFood não retornou motivos de cancelamento para este pedido.",
        tone: "error",
      });
      return;
    }

    setCancellationModalOrder(order);
    setCancellationReasons(reasons);
    setSelectedCancellationCode(firstReason.code);
    setCancellationReasonText(firstReason.description);
  };

  const handleRequestLocalCancellation = (order: Order) => {
    const firstReason = LOCAL_CANCELLATION_REASONS[0];
    setCancellationModalOrder(order);
    setCancellationReasons(LOCAL_CANCELLATION_REASONS);
    setSelectedCancellationCode(firstReason.code);
    setCancellationReasonText(firstReason.description);
  };

  const handleSelectCancellationReason = (code: string) => {
    const reason = cancellationReasons.find((item) => item.code === code);
    setSelectedCancellationCode(code);
    if (reason) setCancellationReasonText(reason.description);
  };

  const closeCancellationModal = () => {
    setCancellationModalOrder(null);
    setCancellationReasons([]);
    setSelectedCancellationCode("");
    setCancellationReasonText("");
  };

  const submitCancellation = async () => {
    if (!cancellationModalOrder || !selectedCancellationCode || !cancellationReasonText.trim()) return;

    if (!isIfoodOrder(cancellationModalOrder)) {
      const updated = await updateStatus(
        cancellationModalOrder,
        "canceled",
        cancellationReasonText.trim(),
      );
      if (updated) closeCancellationModal();
      return;
    }

    const result = await runIfoodAction(cancellationModalOrder, "request_cancellation", {
      cancellationCode: selectedCancellationCode,
      reason: cancellationReasonText.trim(),
    });

    if (result) closeCancellationModal();
  };

  const handlePrint = (order: Order) => {
    const printWindow = window.open("", "", "width=350,height=600");
    if (!printWindow) {
      showToast({
        title: "Impressão bloqueada",
        description: "Permita pop-ups para imprimir o cupom deste pedido.",
        tone: "error",
      });
      return;
    }

    const width = restaurantConfig?.printer_width || 80;
    const fontSize = restaurantConfig?.printer_font_size || 12;
    const fontWeight = restaurantConfig?.printer_font_weight || 700;
    const createdAt = new Date(order.created_at).toLocaleString("pt-BR");
    const addressLineOne = `${order.address?.street || "Rua não informada"}, ${order.address?.number || "S/N"}`;
    const addressLineTwo = [order.address?.neighborhood, order.address?.city, order.address?.state]
      .filter(Boolean)
      .join(" - ");
    const addressZip = order.address?.zip ? `CEP: ${order.address.zip}` : "";
    const paymentLabel = formatIfoodPayment(order);
    const isCashPayment = /dinheiro|cash/i.test(`${order.payment_method} ${paymentLabel}`);
    const cashChange = isCashPayment ? calculateCashChange(order.change_for, order.total) : null;
    const itemsHtml = order.items
      .map(
        (item) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="font-weight:${fontWeight};">${item.quantity}x ${item.product_name}</span>
            <span style="font-weight:${fontWeight};">R$ ${Number(item.price || 0).toFixed(2)}</span>
          </div>
          ${
            item.addons?.length
              ? `<div style="margin-top:4px;color:#444;">
                  <div style="font-weight:${fontWeight};">Complementos</div>
                  ${item.addons
                    .map((addon) => {
                      const addonPrice = getAddonPrice(addon);
                      return `<div class="flex addon">
                        <span>+ ${getAddonLabel(addon)}</span>
                        ${addonPrice > 0 ? `<span>+ ${formatPrice(addonPrice)}${Number(item.quantity || 0) > 1 ? " cada" : ""}</span>` : ""}
                      </div>`;
                    })
                    .join("")}
                </div>`
              : ""
          }
          ${
            item.observation
              ? `<div style="margin-top:4px;font-size:${fontSize - 1}px;">Obs: ${item.observation}</div>`
              : ""
          }
        </div>
      `,
      )
      .join("");

    printWindow.document.write(`
      <html>
      <head>
        <title>Pedido #${formatDisplayNumber(order)}</title>
        <style>
          body { font-family: 'Courier New', monospace; width:${width}mm; padding:8px; font-size:${fontSize}px; color:#111; font-weight:${fontWeight}; }
          .line { border-bottom:1px dashed #000; margin:8px 0; }
          .flex { display:flex; justify-content:space-between; }
          .center { text-align:center; }
          .muted { color:#555; }
          .title { font-size:${fontSize + 2}px; font-weight:${fontWeight}; }
          .addon { gap:8px; font-size:${Math.max(fontSize - 1, 9)}px; }
          .addon span:first-child { flex:1; }
          .addon span:last-child { white-space:nowrap; }
        </style>
      </head>
      <body>
        <div class="center title">${restaurantConfig?.name || "Delivery"}</div>
        <div class="center">Pedido #${formatDisplayNumber(order)}</div>
        <div class="center muted">${createdAt}</div>
        ${order.scheduled_for ? `<div class="center"><strong>AGENDADO: ${new Date(order.scheduled_for).toLocaleString("pt-BR")}</strong></div>` : ""}
        <div class="line"></div>
        <div><strong>Cliente:</strong> ${order.customer_name}</div>
        <div><strong>Telefone:</strong> ${order.customer_phone}</div>
        <div><strong>Status:</strong> ${getStatusLabel(order.status)}</div>
        <div><strong>Pagamento:</strong> ${paymentLabel}</div>
        ${
          isCashPayment
            ? cashChange
              ? `<div class="flex"><span>Valor recebido</span><strong>${formatPrice(cashChange.received)}</strong></div>
                 <div class="flex title"><span>Troco</span><strong>${formatPrice(cashChange.change)}</strong></div>`
              : `<div><strong>Troco:</strong> Sem troco</div>`
            : ""
        }
        <div class="line"></div>
        <div><strong>${formatIfoodOrderType(order) === "Retirada" ? "Retirada" : "Entrega"}</strong></div>
        <div>${addressLineOne}</div>
        ${addressLineTwo ? `<div class="muted">${addressLineTwo}</div>` : ""}
        ${addressZip ? `<div class="muted">${addressZip}</div>` : ""}
        ${order.address?.complement ? `<div class="muted">Comp.: ${order.address.complement}</div>` : ""}
        <div class="line"></div>
        <div><strong>Itens</strong></div>
        ${itemsHtml}
        <div class="line"></div>
        <div class="flex"><span>Subtotal</span><strong>R$ ${Number(order.subtotal || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Entrega</span><strong>R$ ${Number(order.delivery_fee || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Desconto</span><strong>R$ ${Number(order.discount || 0).toFixed(2)}</strong></div>
        <div class="flex"><span>Total</span><strong>R$ ${Number(order.total || 0).toFixed(2)}</strong></div>
        <div class="line"></div>
        <div class="center muted">Impresso pelo Gestor Delivery</div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);

    showToast({
      title: "Cupom enviado para impressão",
      description: `Pedido #${formatDisplayNumber(order)} aberto na janela da impressora.`,
      tone: "success",
    });
  };

  const paymentOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => formatIfoodPayment(order)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, "pt-BR"),
      ),
    [orders],
  );

  const baseFilteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const displayLabel = formatDisplayNumber(order).toLowerCase();
      const itemNames = order.items.map((item) => item.product_name || item.name || "").join(" ").toLowerCase();
      const channelLabel = getChannelLabel(order);
      const fulfillmentLabel = getFulfillmentLabel(order);
      const paymentLabel = formatIfoodPayment(order);
      const matchesQuery =
        term.length === 0
          ? true
          : order.id.toLowerCase().includes(term) ||
            displayLabel.includes(term) ||
            order.customer_name.toLowerCase().includes(term) ||
            order.customer_phone.toLowerCase().includes(term) ||
            itemNames.includes(term) ||
            channelLabel.toLowerCase().includes(term) ||
            paymentLabel.toLowerCase().includes(term);
      const matchesChannel =
        channelFilter === "all" ||
        (channelFilter === "ifood" && channelLabel === "iFood") ||
        (channelFilter === "whatsapp" && channelLabel === "WhatsApp") ||
        (channelFilter === "counter" && channelLabel === "Balcão");
      const matchesFulfillment =
        fulfillmentFilter === "all" ||
        (fulfillmentFilter === "pickup" && fulfillmentLabel === "Retirada") ||
        (fulfillmentFilter === "delivery" && fulfillmentLabel === "Delivery");
      const matchesPayment = paymentFilter === "all" || paymentLabel === paymentFilter;

      return matchesQuery && matchesChannel && matchesFulfillment && matchesPayment;
    });
  }, [channelFilter, fulfillmentFilter, orders, paymentFilter, query]);

  const filteredOrders = useMemo(() => {
    return baseFilteredOrders
      .filter((order) => (activeStatus === "all" ? true : order.status === activeStatus))
      .sort((a, b) => {
        const priority: Record<OrderStatus, number> = {
          pending: 0,
          preparing: 1,
          delivering: 2,
          done: 3,
          canceled: 4,
        };

        return priority[a.status] - priority[b.status] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [activeStatus, baseFilteredOrders]);

  const summary = useMemo(() => {
    const billableOrders = orders.filter((order) => order.status !== "canceled");
    const revenue = billableOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const completedOrders = orders.filter((order) => order.status === "done").length;

    return {
      pending: orders.filter((order) => order.status === "pending").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      delivering: orders.filter((order) => order.status === "delivering").length,
      done: completedOrders,
      canceled: orders.filter((order) => order.status === "canceled").length,
      count: orders.length,
      visibleCount: filteredOrders.length,
      revenue,
      averageTicket: billableOrders.length > 0 ? revenue / billableOrders.length : 0,
    };
  }, [filteredOrders.length, orders]);

  const getCount = (status: StatusFilter) =>
    status === "all"
      ? baseFilteredOrders.length
      : baseFilteredOrders.filter((order) => order.status === status).length;

  const activeFiltersCount = [channelFilter, fulfillmentFilter, paymentFilter].filter(
    (filter) => filter !== "all",
  ).length;

  const clearAllFilters = () => {
    setQuery("");
    setActiveStatus("all");
    setChannelFilter("all");
    setFulfillmentFilter("all");
    setPaymentFilter("all");
  };

  const loadIfoodEvents = async (order: Order, force = false) => {
    if (!isIfoodOrder(order)) return;
    if (!force && ifoodEventsByOrder[order.id]) return;

    setLoadingIfoodEvents((current) => ({ ...current, [order.id]: true }));

    try {
      const params = new URLSearchParams({ orderId: order.id });
      const response = await fetch(`/api/integrations/ifood/orders/events?${params.toString()}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível carregar os eventos iFood.");
      }

      setIfoodEventsByOrder((current) => ({
        ...current,
        [order.id]: Array.isArray(result.events) ? result.events : [],
      }));
    } catch (error) {
      showToast({
        title: "Falha ao carregar eventos iFood",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        tone: "error",
      });
    } finally {
      setLoadingIfoodEvents((current) => ({ ...current, [order.id]: false }));
    }
  };

  const toggleExpandedOrder = (order: Order) => {
    setExpandedOrders((current) =>
      current.includes(order.id)
        ? current.filter((item) => item !== order.id)
        : [...current, order.id],
    );
  };

  const toggleTechnicalDetails = (order: Order) => {
    setExpandedTechnicalOrders((current) =>
      current.includes(order.id)
        ? current.filter((item) => item !== order.id)
        : [...current, order.id],
    );

    if (!expandedTechnicalOrders.includes(order.id)) {
      void loadIfoodEvents(order);
    }
  };

  if (loading) return <OrdersSkeleton />;
  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  return (
    <>
      {cancellationModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--brand)]">
                  Solicitar cancelamento
                </p>
                <h2 className="mt-2 text-xl font-black text-gray-950">
                  Pedido #{formatDisplayNumber(cancellationModalOrder)}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {isIfoodOrder(cancellationModalOrder)
                    ? "Selecione o motivo retornado pelo iFood e confirme a solicitação."
                    : "Informe por que a loja não poderá atender. Essa mensagem será apresentada ao cliente."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCancellationModal}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-sm font-bold text-gray-500"
              >
                Fechar
              </button>
            </div>

            <label className="mt-5 block text-sm font-bold text-gray-700" htmlFor="ifood-cancel-reason">
              Motivo
            </label>
            <select
              id="ifood-cancel-reason"
              value={selectedCancellationCode}
              onChange={(event) => handleSelectCancellationReason(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[var(--brand)]"
            >
              {cancellationReasons.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.description}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-bold text-gray-700" htmlFor="ifood-cancel-text">
              {isIfoodOrder(cancellationModalOrder) ? "Texto enviado ao iFood" : "Mensagem para o cliente"}
            </label>
            <textarea
              id="ifood-cancel-text"
              value={cancellationReasonText}
              onChange={(event) => setCancellationReasonText(event.target.value)}
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-gray-700 outline-none focus:border-[var(--brand)]"
            />

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCancellationModal}
                className="rounded-2xl border border-[var(--line)] px-5 py-3 font-bold text-gray-500"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={submitCancellation}
                disabled={
                  !selectedCancellationCode ||
                  !cancellationReasonText.trim() ||
                  busyIfoodAction === `${cancellationModalOrder.id}:request_cancellation` ||
                  statusUpdatingOrderId === cancellationModalOrder.id
                }
                className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyIfoodAction === `${cancellationModalOrder.id}:request_cancellation` || statusUpdatingOrderId === cancellationModalOrder.id
                  ? "Enviando..."
                  : isIfoodOrder(cancellationModalOrder)
                    ? "Solicitar cancelamento"
                    : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminPageShell className={`space-y-4 ${isSummaryOpen ? "pb-[26rem]" : "pb-24"}`}>
        <AdminPageHeader
          title="Pedidos"
          description={
            isCurrentDate
              ? "Acompanhe e atualize os pedidos em tempo real."
              : "Consulte os pedidos e resultados da data selecionada."
          }
          icon={<ShoppingBag size={22} />}
          action={
            <div className="flex flex-wrap gap-3">
              <OrdersDatePicker value={selectedDate} label={selectedDateLabel} onChange={setSelectedDate} />
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black",
                  isCurrentDate ? storeStatusClasses : "border-gray-200 bg-gray-50 text-gray-600",
                ].join(" ")}
              >
                {isCurrentDate ? <LiveStatusDot className={storeStatusDotClass} /> : <CalendarDays size={16} />}
                {isCurrentDate ? "Loja " + storeStatus.label.toLowerCase() : "Consulta histórica"}
              </div>
            </div>
          }
        />

        <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-orange-500">
                  {isCurrentDate ? "Operação de hoje" : "Operação da data selecionada"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {isCurrentDate
                    ? "Pedidos novos entram automaticamente na fila e ficam priorizados no topo."
                    : `Exibindo os pedidos registrados ou agendados para ${selectedDateLabel.toLowerCase()}.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-xl bg-orange-50 px-3 py-2 text-sm font-black text-orange-700">
                  {summary.pending} pendentes
                </span>
                <span className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">
                  {summary.preparing} em preparo
                </span>
                <span className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-black text-violet-700">
                  {summary.delivering} em rota
                </span>
              </div>
            </div>
          </div>
          {isCurrentDate && (
            <button
              type="button"
              onClick={enableChime}
              className={`inline-flex items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-black shadow-sm transition ${
                isChimeEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-orange-200 bg-white text-[var(--brand)] hover:bg-orange-50"
              }`}
            >
              <BellRing size={18} />
              {isChimeEnabled ? "Campainha ativa" : "Ativar campainha"}
            </button>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 shadow-sm">
              <Search size={18} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, telefone, produto ou número do pedido..."
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsFiltersOpen((current) => !current)}
              aria-expanded={isFiltersOpen}
              aria-controls="orders-filters-panel"
              className={`inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition ${
                isFiltersOpen || activeFiltersCount > 0
                  ? "border-orange-300 text-[var(--brand)]"
                  : "border-[var(--line)] text-gray-700"
              }`}
            >
              <Filter size={17} />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-[var(--brand)]">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${isFiltersOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {isFiltersOpen && (
            <div
              id="orders-filters-panel"
              className="grid gap-3 rounded-2xl border border-orange-100 bg-[#fffdfa] p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr_auto] xl:items-end"
            >
              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Canal
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Todos os canais</option>
                  <option value="ifood">iFood</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="counter">Balcão</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Atendimento
                <select
                  value={fulfillmentFilter}
                  onChange={(event) => setFulfillmentFilter(event.target.value as FulfillmentFilter)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Entrega e retirada</option>
                  <option value="delivery">Delivery</option>
                  <option value="pickup">Retirada</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-gray-500">
                Pagamento
                <select
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-gray-700"
                >
                  <option value="all">Todos os pagamentos</option>
                  {paymentOptions.map((payment) => (
                    <option key={payment} value={payment}>
                      {payment}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  setChannelFilter("all");
                  setFulfillmentFilter("all");
                  setPaymentFilter("all");
                }}
                disabled={activeFiltersCount === 0}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-50"
              >
                Limpar avançados
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStatus(tab.id)}
                className={`inline-flex min-w-[92px] items-center justify-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  activeStatus === tab.id
                    ? "border-[var(--brand)] bg-white text-[var(--brand)] shadow-sm"
                    : "border-[var(--line)] bg-white text-gray-700 hover:border-orange-200"
                }`}
              >
                {tab.label}
                {getCount(tab.id) > 0 && (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-[var(--brand)]">
                    {getCount(tab.id)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-sm">
            <div className="orders-table-header hidden grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] items-center gap-2 border-b border-[var(--line)] bg-[#fffdfa] px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.06em] text-gray-400 xl:grid">
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Canal</span>
              <span>Itens</span>
              <span>Valor</span>
              <span className="whitespace-nowrap">Método de pagamento</span>
              <span>Status</span>
              <span>Horário</span>
              <span className="text-center">Ações</span>
            </div>

            {filteredOrders.length === 0 ? (
              <AdminEmptyState
                icon={<Package size={22} />}
                title="Não encontrou o pedido que procura?"
                description="Tente ajustar os filtros ou buscar por outro termo."
                action={
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                  >
                    <RefreshCw size={16} />
                    Limpar filtros
                  </button>
                }
              />
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {filteredOrders.map((order) => {
                  const isExpanded = expandedOrders.includes(order.id);
                  const statusMeta = STATUS_META[order.status];
                  const ifoodMeta = getIfoodMeta(order);
                  const ifoodCancellation = getIfoodCancellation(order);
                  const channelLabel = getChannelLabel(order);
                  const paymentText = formatIfoodPayment(order);
                  const primaryActionLabel = getPrimaryActionLabel(order);
                  const compactPrimaryActionLabel = getCompactPrimaryActionLabel(order);
                  const firstItem = order.items[0];

                  return (
                    <div key={order.id} className={order.status === "pending" ? "bg-orange-50/25" : "bg-white"}>
                      <div className="orders-table-row grid gap-4 px-5 py-4 xl:grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] xl:items-center xl:gap-2 xl:px-4">
                        <div className="orders-table-cell text-center" data-label="Pedido">
                          <p className="text-sm font-black text-gray-950">#{formatDisplayNumber(order)}</p>
                          <p className="mt-1 text-[11px] font-medium text-gray-500">
                            {formatDate(order.created_at)}, {formatTime(order.created_at)}
                          </p>
                          {order.scheduled_for && (
                            <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
                              Agendado {formatDateTime(order.scheduled_for)}
                            </span>
                          )}
                        </div>

                        <div className="orders-table-cell min-w-0 text-center" data-label="Cliente">
                          <p className="truncate text-sm font-bold text-gray-950">{order.customer_name}</p>
                          <p className="mt-1 truncate text-[11px] font-medium text-gray-500">{order.customer_phone}</p>
                        </div>

                        <div className="orders-table-cell flex items-center justify-center gap-2" data-label="Canal">
                          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            isIfoodOrder(order) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {isIfoodOrder(order) ? <Store size={15} /> : <ClipboardList size={15} />}
                          </span>
                          <div>
                            <p className="text-xs font-black text-gray-950">{channelLabel}</p>
                            <p className="text-[10px] font-medium text-gray-500">{getFulfillmentLabel(order)}</p>
                          </div>
                        </div>

                        <div className="orders-table-cell text-center" data-label="Itens">
                          <p className="text-sm font-black text-gray-950">
                            {order.items.length} {order.items.length === 1 ? "item" : "itens"}
                          </p>
                        </div>

                        <div className="orders-table-cell text-center" data-label="Valor">
                          <p className="text-sm font-black text-gray-950">{formatPrice(Number(order.total || 0))}</p>
                        </div>

                        <div className="orders-table-cell min-w-0 text-center" data-label="Pagamento">
                          <p className="break-words text-xs font-bold leading-4 text-gray-700">
                            {paymentText || "Não informado"}
                          </p>
                        </div>

                        <div className="orders-table-cell flex justify-center" data-label="Status">
                          <OrderStatusBadge status={order.status} className="font-black" />
                        </div>

                        <div className="orders-table-cell text-center" data-label="Horário">
                          <p className="text-xs font-black text-gray-950">{getRelativeOrderTime(order.created_at)}</p>
                          <p className="mt-1 text-[11px] font-medium text-gray-500">{formatTime(order.created_at)}</p>
                        </div>

                        <div className="orders-table-cell orders-actions-cell flex items-center gap-1 xl:justify-center" data-label="Ações">
                          {primaryActionLabel && (
                            <button
                              type="button"
                              onClick={() => void handlePrimaryAction(order)}
                              disabled={busyIfoodAction.startsWith(`${order.id}:`)}
                              className="inline-flex h-9 min-w-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-[11px] font-black text-white shadow-sm disabled:opacity-50"
                              aria-label={primaryActionLabel}
                            >
                              {busyIfoodAction.startsWith(`${order.id}:`) ? "..." : compactPrimaryActionLabel}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrint(order)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 hover:border-orange-200 hover:text-[var(--brand)]"
                            aria-label="Imprimir pedido"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpandedOrder(order)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 hover:border-orange-200 hover:text-[var(--brand)]"
                            aria-label="Ver detalhes do pedido"
                            title="Ver detalhes"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[var(--line)] bg-[#fffdfa] px-5 py-5 xl:px-6">
                          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.9fr_260px]">
                            <div>
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-black text-gray-950">Itens do pedido</p>
                                  <p className="text-sm text-gray-500">
                                    {firstItem?.product_name || "Pedido sem itens cadastrados"}
                                  </p>
                                </div>
                                {order.external_display_id && (
                                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600">
                                    iFood #{order.external_display_id}
                                  </span>
                                )}
                              </div>

                              <div className="space-y-2">
                                {order.items.map((item: OrderItem, index: number) => (
                                  <div key={`${item.product_name}-${index}`} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                                    <div className="flex items-start gap-3">
                                      <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-black text-gray-600">
                                        {item.quantity || 1}x
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="font-black text-gray-950">{item.product_name || item.name || "Item"}</p>
                                        {item.addons?.length ? (
                                          <p className="mt-1 text-sm text-gray-500">
                                            {item.addons.map((addon) => getAddonLabel(addon)).join(", ")}
                                          </p>
                                        ) : null}
                                        {item.observation ? (
                                          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                            Obs: {item.observation}
                                          </p>
                                        ) : null}
                                      </div>
                                      <strong className="text-sm text-gray-950">
                                        {formatPrice(Number(item.price || 0))}
                                      </strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              {order.scheduled_for && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                  <p className="text-xs font-bold uppercase text-amber-700">Pedido agendado</p>
                                  <p className="mt-1 font-black text-amber-950">{formatDateTime(order.scheduled_for)}</p>
                                </div>
                              )}
                              {isIfoodOrder(order) && (
                                <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                                  <p className="text-xs font-black uppercase tracking-[0.14em] text-red-400">
                                    Pedido iFood
                                  </p>
                                  <div className="mt-3 grid gap-2 text-sm text-gray-600">
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Tipo</span>
                                      <strong className="text-gray-950">{formatIfoodOrderType(order)}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span>Timing</span>
                                      <strong className="text-gray-950">{formatIfoodTiming(order)}</strong>
                                    </div>
                                    {ifoodMeta.customerDocument && (
                                      <div className="flex items-center justify-between gap-3">
                                        <span>CPF/CNPJ</span>
                                        <strong className="text-gray-950">{ifoodMeta.customerDocument}</strong>
                                      </div>
                                    )}
                                    {ifoodMeta.schedule?.deliveryDateTimeStart && (
                                      <div className="rounded-xl bg-[#fcfaf7] p-3">
                                        <p className="font-bold text-gray-950">Agendamento</p>
                                        <p className="mt-1 text-xs text-gray-500">
                                          {formatDateTime(ifoodMeta.schedule.deliveryDateTimeStart)}
                                          {" até "}
                                          {formatDateTime(ifoodMeta.schedule.deliveryDateTimeEnd)}
                                        </p>
                                      </div>
                                    )}
                                    {ifoodMeta.observations && (
                                      <div className="rounded-xl bg-amber-50 p-3 text-amber-800">
                                        Obs. pedido: {ifoodMeta.observations}
                                      </div>
                                    )}
                                    {ifoodCancellation && (
                                      <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-red-700">
                                        <p className="font-bold">
                                          {formatIfoodCancellationStatus(ifoodCancellation.status)}
                                        </p>
                                        {ifoodCancellation.reason && (
                                          <p className="mt-1 text-xs">{ifoodCancellation.reason}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                                <div className="flex gap-3">
                                  <div className="mt-0.5 rounded-xl bg-gray-50 p-2 text-gray-500">
                                    <MapPin size={16} />
                                  </div>
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">
                                      Entrega
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-gray-700">
                                      {order.address?.street || "Rua não informada"}, {order.address?.number || "S/N"}
                                      <br />
                                      {order.address?.neighborhood || "Sem bairro"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {listIfoodBenefits(order).length > 0 && (
                                <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm">
                                  <p className="font-black text-gray-950">Cupons/benefícios</p>
                                  <div className="mt-2 space-y-1 text-gray-600">
                                    {listIfoodBenefits(order).map((benefit, index: number) => (
                                      <p key={index}>
                                        {getIfoodBenefitLabel(benefit)}:{" "}
                                        {formatPrice(getIfoodBenefitAmount(benefit))}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm">
                                <div className="flex items-center justify-between text-gray-500">
                                  <span>Subtotal</span>
                                  <span>{formatPrice(Number(order.subtotal || 0))}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-gray-500">
                                  <span>Entrega</span>
                                  <span>{formatPrice(Number(order.delivery_fee || 0))}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-gray-500">
                                  <span>Desconto</span>
                                  <span>{formatPrice(Number(order.discount || 0))}</span>
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3 font-black text-gray-950">
                                  <span>Total</span>
                                  <span>{formatPrice(Number(order.total || 0))}</span>
                                </div>
                                <p className="mt-3 text-xs font-medium text-gray-500">
                                  Pagamento: {paymentText || order.payment_method}
                                  {order.change_for ? ` - Troco para ${order.change_for}` : ""}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handlePrint(order)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                              >
                                <Printer size={15} />
                                Imprimir cupom
                              </button>

                              {primaryActionLabel && (
                                <button
                                  type="button"
                                  onClick={() => void handlePrimaryAction(order)}
                                  disabled={busyIfoodAction.startsWith(`${order.id}:`) || statusUpdatingOrderId === order.id}
                                  className="brand-gradient w-full rounded-2xl px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                                >
                                  {busyIfoodAction.startsWith(`${order.id}:`) ? "Enviando..." : primaryActionLabel}
                                </button>
                              )}

                              {(order.status === "pending" || order.status === "preparing") && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    isIfoodOrder(order)
                                      ? handleRequestIfoodCancellation(order)
                                      : handleRequestLocalCancellation(order)
                                  }
                                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-600"
                                  disabled={busyIfoodAction.startsWith(`${order.id}:`) || statusUpdatingOrderId === order.id}
                                >
                                  Solicitar cancelamento
                                </button>
                              )}

                              {isIfoodOrder(order) && (
                                <button
                                  type="button"
                                  onClick={() => toggleTechnicalDetails(order)}
                                  className="w-full rounded-2xl border border-[var(--line)] bg-[#fcfaf7] px-4 py-3 text-left text-xs font-bold text-gray-500"
                                >
                                  {expandedTechnicalOrders.includes(order.id)
                                    ? "Ocultar histórico iFood"
                                    : "Histórico iFood"}
                                </button>
                              )}
                            </div>
                          </div>

                          {expandedTechnicalOrders.includes(order.id) && (
                            <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-black text-gray-950">Histórico iFood</p>
                                  <p className="text-xs text-gray-500">
                                    {order.external_order_id || "Order ID não informado"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void loadIfoodEvents(order, true)}
                                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600"
                                >
                                  Atualizar
                                </button>
                              </div>

                              {loadingIfoodEvents[order.id] ? (
                                <p className="mt-3 text-xs text-gray-500">Carregando eventos...</p>
                              ) : (ifoodEventsByOrder[order.id] || []).length === 0 ? (
                                <p className="mt-3 text-xs text-gray-500">
                                  Nenhum evento registrado para este pedido ainda.
                                </p>
                              ) : (
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {(ifoodEventsByOrder[order.id] || []).map((event) => {
                                    const isRawExpanded = expandedIfoodEvent === event.id;

                                    return (
                                      <div key={event.id} className="rounded-xl bg-[#fcfaf7] p-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <p className="text-sm font-black text-gray-950">
                                              {event.event_code}
                                              {event.event_full_code ? ` / ${event.event_full_code}` : ""}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">
                                              {event.event_group || "ORDER_STATUS"} -{" "}
                                              {formatDateTime(event.event_created_at || event.created_at)}
                                            </p>
                                          </div>
                                          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                            event.acknowledged_at
                                              ? "bg-blue-50 text-blue-700"
                                              : "bg-gray-100 text-gray-500"
                                          }`}>
                                            {event.acknowledged_at ? "ACK enviado" : "Sem ACK"}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedIfoodEvent(isRawExpanded ? "" : event.id)}
                                          className="mt-2 text-xs font-bold text-[var(--brand)]"
                                        >
                                          {isRawExpanded ? "Ocultar dados técnicos" : "Dados técnicos"}
                                        </button>
                                        {isRawExpanded && (
                                          <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-gray-950 p-3 text-[11px] text-gray-100">
                                            {JSON.stringify(event.raw_payload, null, 2)}
                                          </pre>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="fixed bottom-3 left-3 right-3 z-40 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6 md:mx-auto md:max-w-[1460px]">
        {isSummaryOpen && (
          <div className="max-h-[70vh] overflow-y-auto border-b border-[var(--line)] p-3 md:p-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {STAT_CARDS.map((card) => {
                const count = summary[card.id];
                const meta = STATUS_META[card.id];

                return (
                  <button
                    type="button"
                    key={card.id}
                    onClick={() => setActiveStatus(card.id)}
                    className={`flex min-h-[64px] items-center justify-between rounded-[16px] border bg-white px-3 py-2.5 text-left transition hover:border-orange-200 ${
                      activeStatus === card.id ? "border-orange-300 ring-2 ring-orange-50" : "border-[var(--line)]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                        {meta.icon}
                      </span>
                      <span className="truncate text-sm font-bold text-gray-600">{card.title}</span>
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm font-black text-gray-950">
                      {count}
                    </span>
                  </button>
                );
              })}

              <div className="flex min-h-[70px] items-center gap-3 rounded-[16px] border border-[var(--line)] bg-white px-4 py-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-[var(--brand)]">
                  <WalletCards size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-500">{isCurrentDate ? "Valor de hoje" : "Valor do dia"}</p>
                  <p className="text-lg font-black text-gray-950">{formatPrice(summary.revenue)}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Total de pedidos</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{summary.count}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">
                  {isCurrentDate ? "Online agora" : selectedDateLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Faturamento</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{formatPrice(summary.revenue)}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">Sem cancelados</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Cancelados</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{summary.canceled}</p>
                <p className="mt-1 text-xs font-bold text-gray-500">{selectedDateLabel}</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Ticket médio</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{formatPrice(summary.averageTicket)}</p>
                <p className="mt-1 text-xs font-bold text-gray-500">{summary.visibleCount} visíveis</p>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsSummaryOpen((current) => !current)}
          className="flex w-full flex-col gap-2 px-3 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between md:px-4"
          aria-expanded={isSummaryOpen}
        >
          <div>
            <p className="text-base font-black text-gray-950 md:text-lg">Resumo do dia</p>
            <p className="text-xs text-gray-500 md:text-sm">
              {isCurrentDate ? "Atualizado em tempo real" : selectedDateLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="rounded-xl bg-orange-50 px-2.5 py-1.5 text-xs font-black text-[var(--brand)] md:px-3 md:py-2 md:text-sm">
              {summary.count} {summary.count === 1 ? "pedido" : "pedidos"}
            </span>
            <span className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 md:px-3 md:py-2 md:text-sm">
              {formatPrice(summary.revenue)}
            </span>
            <span className="rounded-xl bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-700 md:px-3 md:py-2 md:text-sm">
              {summary.canceled} {summary.canceled === 1 ? "cancelado" : "cancelados"}
            </span>
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 transition-transform ${isSummaryOpen ? "rotate-180" : ""}`}>
              <ChevronDown size={18} />
            </span>
          </div>
        </button>
        </section>
      </AdminPageShell>
    </>
  );
}
