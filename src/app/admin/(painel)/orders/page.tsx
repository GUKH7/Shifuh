"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  Filter,
  MapPin,
  MoreVertical,
  Package,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  WalletCards,
  XCircle,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";
import { OrdersSkeleton } from "./OrdersSkeleton";
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
  getAddonLabel,
  getIfoodBenefitAmount,
  getIfoodBenefitLabel,
  getIfoodCancellation,
  getIfoodMeta,
  getStatusLabel,
  isIfoodOrder,
  isToday,
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
};

type OrderStatus = Order["status"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type IfoodAction =
  | "confirm"
  | "dispatch"
  | "ready_to_pickup"
  | "cancellation_reasons"
  | "request_cancellation";

const STATUS_META: Record<OrderStatus, {
  label: string;
  dot: string;
  badge: string;
  icon: ReactNode;
}> = {
  pending: {
    label: "Pendente",
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    icon: <ShoppingBag size={18} />,
  },
  preparing: {
    label: "Em preparo",
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    icon: <Package size={18} />,
  },
  delivering: {
    label: "Em rota",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    icon: <Bike size={18} />,
  },
  done: {
    label: "Concluido",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CheckCircle2 size={18} />,
  },
  canceled: {
    label: "Cancelado",
    dot: "bg-red-500",
    badge: "border-red-200 bg-red-50 text-red-700",
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
  { id: "done", title: "Concluidos", tone: "bg-emerald-50 text-emerald-600" },
  { id: "canceled", title: "Cancelados", tone: "bg-red-50 text-red-600" },
];

function getCustomerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getRelativeOrderTime(dateStr: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (minutes < 1) return "Agora ha pouco";
  if (minutes < 60) return `${minutes} min atras`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atras`;
  return formatDate(dateStr);
}

function getChannelLabel(order: Order) {
  if (isIfoodOrder(order)) return "iFood";
  if (formatIfoodOrderType(order) === "Retirada") return "Balcao";
  return "WhatsApp";
}

function getFulfillmentLabel(order: Order) {
  return formatIfoodOrderType(order) === "Retirada" ? "Retirada" : "Delivery";
}

function getPrimaryActionLabel(order: Order) {
  if (order.status === "pending") return "Aceitar pedido";
  if (order.status === "preparing") {
    return isIfoodOrder(order) && String(getIfoodMeta(order).orderType).toUpperCase() === "TAKEOUT"
      ? "Pronto para retirada"
      : "Despachar pedido";
  }
  if (order.status === "delivering") return "Marcar concluido";
  return "";
}

export default function OrdersPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig | null>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [lastSeenOrderId, setLastSeenOrderId] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [busyIfoodAction, setBusyIfoodAction] = useState("");
  const [cancellationModalOrder, setCancellationModalOrder] = useState<Order | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<IfoodCancellationReason[]>([]);
  const [selectedCancellationCode, setSelectedCancellationCode] = useState("");
  const [cancellationReasonText, setCancellationReasonText] = useState("");
  const [ifoodEventsByOrder, setIfoodEventsByOrder] = useState<Record<string, IfoodEventAudit[]>>({});
  const [loadingIfoodEvents, setLoadingIfoodEvents] = useState<Record<string, boolean>>({});
  const [expandedIfoodEvent, setExpandedIfoodEvent] = useState("");
  const [expandedTechnicalOrders, setExpandedTechnicalOrders] = useState<string[]>([]);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

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
          if (payload.eventType === "INSERT" && payload.new?.id && payload.new.id !== lastSeenOrderId) {
            setLastSeenOrderId(String(payload.new.id));
            const display = String(payload.new.display_number || 0).padStart(4, "0");
            playNewOrderChime();
            showToast({
              title: "Novo pedido recebido",
              description: `Pedido #${display === "0000" ? String(payload.new.id).slice(0, 4) : display} entrou na fila da operacao.`,
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
  }, [lastSeenOrderId, restaurantId, showToast, supabase]);

  useEffect(() => {
    if (!restaurantId) return;

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
  }, [restaurantId]);

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { restaurant: resto, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!resto) {
        setErrorMsg("Nao foi possivel localizar a loja.");
        return;
      }

      setRestaurantConfig(resto);
      setRestaurantId(resto.id);

      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", resto.id)
        .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      type OrderRow = Omit<Order, "items"> & { order_items?: Order["items"] | null };
      const mappedOrders = ((data || []) as OrderRow[])
        .map((order) => ({
          ...order,
          items: order.order_items || [],
        }))
        .filter((order: Order) => isToday(order.created_at)) as Order[];

      setOrders(mappedOrders);

      if (mappedOrders.length > 0) {
        setLastSeenOrderId((current) => current || String(mappedOrders[0].id));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Erro de conexao.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const updateStatus = async (order: Order, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((current) => (current.id === order.id ? { ...current, status: newStatus } : current)),
    );

    const response = await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: newStatus,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      showToast({
        title: "Nao foi possivel atualizar o pedido",
        description: result.error || "Tente novamente em instantes.",
        tone: "error",
      });
      void fetchOrders();
      return;
    }

    showToast({
      title: "Status atualizado",
      description: result.notification?.sent
        ? `Pedido #${formatDisplayNumber(order)} agora esta como ${getStatusLabel(newStatus).toLowerCase()} e o cliente foi avisado.`
        : `Pedido #${formatDisplayNumber(order)} agora esta como ${getStatusLabel(newStatus).toLowerCase()}.`,
      tone: "success",
    });

    if (result.notification && !result.notification.sent && !result.notification.skipped) {
      showToast({
        title: "WhatsApp nao enviado",
        description: result.notification.error || "Confira a configuracao da API do robo.",
        tone: "error",
      });
    }

    if (newStatus === "preparing" && restaurantConfig?.printer_auto_print) {
      setTimeout(() => handlePrint({ ...order, status: newStatus }), 150);
    }
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
        throw new Error(result.error || "Nao foi possivel executar a acao no iFood.");
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
        title: "Nao foi possivel atualizar o pedido",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
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
        description: "O iFood nao retornou motivos de cancelamento para este pedido.",
        tone: "error",
      });
      return;
    }

    setCancellationModalOrder(order);
    setCancellationReasons(reasons);
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

  const submitIfoodCancellation = async () => {
    if (!cancellationModalOrder || !selectedCancellationCode || !cancellationReasonText.trim()) return;

    const result = await runIfoodAction(cancellationModalOrder, "request_cancellation", {
      cancellationCode: selectedCancellationCode,
      reason: cancellationReasonText.trim(),
    });

    if (result) closeCancellationModal();
  };

  const handlePrint = (order: Order) => {
    const printWindow = window.open("", "", "width=350,height=600");
    if (!printWindow) return;

    const width = restaurantConfig?.printer_width || 80;
    const fontSize = restaurantConfig?.printer_font_size || 12;
    const fontWeight = restaurantConfig?.printer_font_weight || 700;
    const createdAt = new Date(order.created_at).toLocaleString("pt-BR");
    const addressLineOne = `${order.address?.street || "Rua nao informada"}, ${order.address?.number || "S/N"}`;
    const addressLineTwo = [order.address?.neighborhood, order.address?.city, order.address?.state]
      .filter(Boolean)
      .join(" - ");
    const addressZip = order.address?.zip ? `CEP: ${order.address.zip}` : "";
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
              ? `<div style="margin-top:4px;color:#444;">Adicionais: ${item.addons.map((addon) => getAddonLabel(addon)).join(", ")}</div>`
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
        </style>
      </head>
      <body>
        <div class="center title">${restaurantConfig?.name || "Delivery"}</div>
        <div class="center">Pedido #${formatDisplayNumber(order)}</div>
        <div class="center muted">${createdAt}</div>
        <div class="line"></div>
        <div><strong>Cliente:</strong> ${order.customer_name}</div>
        <div><strong>Telefone:</strong> ${order.customer_phone}</div>
        <div><strong>Status:</strong> ${getStatusLabel(order.status)}</div>
        <div><strong>Pagamento:</strong> ${order.payment_method}${order.change_for ? ` | Troco para R$ ${order.change_for}` : ""}</div>
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
  };

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = activeStatus === "all" ? true : order.status === activeStatus;
      const displayLabel = formatDisplayNumber(order).toLowerCase();
      const itemNames = order.items.map((item) => item.product_name || item.name || "").join(" ").toLowerCase();
      const matchesQuery =
        term.length === 0
          ? true
          : order.id.toLowerCase().includes(term) ||
            displayLabel.includes(term) ||
            order.customer_name.toLowerCase().includes(term) ||
            order.customer_phone.toLowerCase().includes(term) ||
            itemNames.includes(term);

      return matchesStatus && matchesQuery;
    });
  }, [activeStatus, orders, query]);

  const summary = useMemo(() => {
    const revenue = orders
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
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
      averageTicket: orders.length > 0 ? revenue / Math.max(1, orders.length) : 0,
    };
  }, [filteredOrders.length, orders]);

  const getCount = (status: StatusFilter) =>
    status === "all" ? orders.length : orders.filter((order) => order.status === status).length;

  const loadIfoodEvents = async (order: Order, force = false) => {
    if (!isIfoodOrder(order)) return;
    if (!force && ifoodEventsByOrder[order.id]) return;

    setLoadingIfoodEvents((current) => ({ ...current, [order.id]: true }));

    try {
      const params = new URLSearchParams({ orderId: order.id });
      const response = await fetch(`/api/integrations/ifood/orders/events?${params.toString()}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Nao foi possivel carregar os eventos iFood.");
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
  if (errorMsg) return <div className="p-8 text-center text-red-600">{errorMsg}</div>;

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
                  Selecione o motivo retornado pelo iFood e confirme a solicitacao.
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
              Texto enviado ao iFood
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
                onClick={submitIfoodCancellation}
                disabled={
                  !selectedCancellationCode ||
                  !cancellationReasonText.trim() ||
                  busyIfoodAction === `${cancellationModalOrder.id}:request_cancellation`
                }
                className="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyIfoodAction === `${cancellationModalOrder.id}:request_cancellation`
                  ? "Enviando..."
                  : "Solicitar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`mx-auto max-w-[1540px] space-y-5 ${isSummaryOpen ? "pb-96" : "pb-28"}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950">Pedidos</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Acompanhe e atualize os pedidos em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm">
              <CalendarDays size={17} className="text-gray-500" />
              Hoje, {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              <ChevronDown size={16} className="text-gray-400" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Loja aberta
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 shadow-sm">
              <Search size={18} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, telefone, produto ou numero do pedido..."
                className="w-full bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700 shadow-sm"
            >
              <Filter size={17} />
              Filtros
              <ChevronDown size={16} className="text-gray-400" />
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            {STATUS_FILTERS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStatus(tab.id)}
                className={`inline-flex min-w-[96px] items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
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
            <div className="hidden grid-cols-[140px_1.45fr_1.05fr_0.8fr_0.95fr_1fr_0.95fr_150px] gap-4 border-b border-[var(--line)] bg-[#fffdfa] px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-gray-400 xl:grid">
              <span>Pedido</span>
              <span>Cliente</span>
              <span>Canal</span>
              <span>Itens</span>
              <span>Valor</span>
              <span>Status</span>
              <span>Horario</span>
              <span>Acoes</span>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Package className="mx-auto h-12 w-12 text-orange-300" />
                <p className="mt-4 font-black text-gray-950">Nao encontrou o pedido que procura?</p>
                <p className="mt-1 text-sm text-gray-500">Tente ajustar os filtros ou buscar por outro termo.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveStatus("all");
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                >
                  <RefreshCw size={16} />
                  Limpar filtros
                </button>
              </div>
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
                  const firstItem = order.items[0];

                  return (
                    <div key={order.id} className="bg-white">
                      <div className="grid gap-4 px-5 py-4 xl:grid-cols-[140px_1.45fr_1.05fr_0.8fr_0.95fr_1fr_0.95fr_150px] xl:items-center xl:px-6">
                        <div>
                          <p className="font-black text-gray-950">#{formatDisplayNumber(order)}</p>
                          <p className="mt-1 text-xs font-medium text-gray-500">
                            {formatDate(order.created_at)}, {formatTime(order.created_at)}
                          </p>
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-black text-orange-700">
                            {getCustomerInitials(order.customer_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-gray-950">{order.customer_name}</p>
                            <p className="mt-1 text-xs font-medium text-gray-500">{order.customer_phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                            isIfoodOrder(order) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {isIfoodOrder(order) ? <Store size={17} /> : <ClipboardList size={17} />}
                          </span>
                          <div>
                            <p className="text-sm font-black text-gray-950">{channelLabel}</p>
                            <p className="text-xs font-medium text-gray-500">{getFulfillmentLabel(order)}</p>
                          </div>
                        </div>

                        <div>
                          <p className="font-black text-gray-950">{order.items.length} item(ns)</p>
                          <button
                            type="button"
                            onClick={() => toggleExpandedOrder(order)}
                            className="mt-1 text-xs font-black text-[var(--brand)]"
                          >
                            Ver detalhes
                          </button>
                        </div>

                        <div>
                          <p className="font-black text-gray-950">{formatPrice(Number(order.total || 0))}</p>
                          <p className="mt-1 text-xs font-bold text-emerald-600">
                            {paymentText || order.payment_method || "Pagamento pendente"}
                          </p>
                        </div>

                        <div>
                          <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black ${statusMeta.badge}`}>
                            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                            {statusMeta.label}
                          </span>
                        </div>

                        <div>
                          <p className="text-sm font-black text-gray-950">{getRelativeOrderTime(order.created_at)}</p>
                          <p className="mt-1 text-xs font-medium text-gray-500">{formatTime(order.created_at)}</p>
                        </div>

                        <div className="flex items-center gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => toggleExpandedOrder(order)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 hover:border-orange-200 hover:text-[var(--brand)]"
                            aria-label="Ver detalhes do pedido"
                          >
                            <Eye size={16} />
                          </button>
                          {primaryActionLabel && (
                            <button
                              type="button"
                              onClick={() => void handlePrimaryAction(order)}
                              disabled={busyIfoodAction.startsWith(`${order.id}:`)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 hover:border-orange-200 hover:text-[var(--brand)] disabled:opacity-50"
                              aria-label={primaryActionLabel}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrint(order)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 hover:border-orange-200 hover:text-[var(--brand)]"
                            aria-label="Imprimir pedido"
                          >
                            <MoreVertical size={16} />
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
                                          {" ate "}
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
                                      {order.address?.street || "Rua nao informada"}, {order.address?.number || "S/N"}
                                      <br />
                                      {order.address?.neighborhood || "Sem bairro"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {listIfoodBenefits(order).length > 0 && (
                                <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm">
                                  <p className="font-black text-gray-950">Cupons/beneficios</p>
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
                                  disabled={busyIfoodAction.startsWith(`${order.id}:`)}
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
                                      : updateStatus(order, "canceled")
                                  }
                                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-600"
                                  disabled={busyIfoodAction.startsWith(`${order.id}:`)}
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
                                    ? "Ocultar eventos iFood"
                                    : "Eventos iFood"}
                                </button>
                              )}
                            </div>
                          </div>

                          {expandedTechnicalOrders.includes(order.id) && (
                            <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-black text-gray-950">Eventos da integracao</p>
                                  <p className="text-xs text-gray-500">
                                    {order.external_order_id || "Order ID nao informado"}
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
                                          {isRawExpanded ? "Ocultar payload" : "Ver payload"}
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

        <div className="flex flex-col gap-4 rounded-[18px] border border-dashed border-orange-200 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[var(--brand)]">
              <Package size={24} />
            </span>
            <div>
              <p className="font-black text-gray-950">Nao encontrou o pedido que procura?</p>
              <p className="mt-1 text-sm text-gray-500">Tente ajustar os filtros ou buscar por outro termo.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveStatus("all");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm"
          >
            <RefreshCw size={16} />
            Limpar filtros
          </button>
        </div>

      </div>

      <section className="fixed bottom-4 right-4 z-40 w-[min(calc(100vw-7rem),1540px)] overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/95 shadow-[0_24px_70px_rgba(17,16,15,0.16)] backdrop-blur md:right-8">
        {isSummaryOpen && (
          <div className="border-b border-[var(--line)] p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {STAT_CARDS.map((card) => {
                const count = summary[card.id];
                const meta = STATUS_META[card.id];

                return (
                  <button
                    type="button"
                    key={card.id}
                    onClick={() => setActiveStatus(card.id)}
                    className={`flex min-h-[70px] items-center justify-between rounded-[16px] border bg-white px-4 py-3 text-left transition hover:border-orange-200 ${
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
                  <p className="text-sm font-bold text-gray-500">Valor de hoje</p>
                  <p className="text-lg font-black text-gray-950">{formatPrice(summary.revenue)}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Total de pedidos</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{summary.count}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">Online agora</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Faturamento</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{formatPrice(summary.revenue)}</p>
                <p className="mt-1 text-xs font-bold text-emerald-600">Sem cancelados</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Cancelados</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{summary.canceled}</p>
                <p className="mt-1 text-xs font-bold text-gray-500">Hoje</p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="text-sm font-bold text-gray-500">Ticket medio</p>
                <p className="mt-2 text-2xl font-black text-gray-950">{formatPrice(summary.averageTicket)}</p>
                <p className="mt-1 text-xs font-bold text-gray-500">{summary.visibleCount} visiveis</p>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsSummaryOpen((current) => !current)}
          className="flex w-full flex-col gap-3 px-4 py-3 text-left md:flex-row md:items-center md:justify-between"
          aria-expanded={isSummaryOpen}
        >
          <div>
            <p className="text-lg font-black text-gray-950">Resumo do dia</p>
            <p className="mt-1 text-sm text-gray-500">Atualizado em tempo real</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl bg-orange-50 px-3 py-2 text-sm font-black text-[var(--brand)]">
              {summary.count} pedidos
            </span>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
              {formatPrice(summary.revenue)}
            </span>
            <span className="rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-700">
              {summary.canceled} cancelados
            </span>
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 transition-transform ${isSummaryOpen ? "rotate-180" : ""}`}>
              <ChevronDown size={18} />
            </span>
          </div>
        </button>
      </section>
    </>
  );
}
