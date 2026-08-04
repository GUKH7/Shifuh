"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
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
  X,
  XCircle,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { useToast } from "@/components/ui/toast-provider";
import { OrderStatusBadge } from "@/components/ui/order-status-badge";
import { LiveStatusDot } from "@/components/ui/live-status-dot";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/admin-primitives";
import { OrdersSkeleton } from "./OrdersSkeleton";
import type { IfoodCancellationReason, IfoodEventAudit, Order, OrderItem } from "./types";
import {
  STATUS_FILTERS,
  calculateCashChange,
  formatDate,
  formatDateTime,
  formatDisplayNumber,
  formatIfoodOrderType,
  formatIfoodPayment,
  formatPrice,
  formatTime,
  getAddonLabel,
  getIfoodBenefitAmount,
  getIfoodBenefitLabel,
  getIfoodMeta,
  getStatusLabel,
  isIfoodOrder,
  listIfoodBenefits,
  normalizeCancellationReasons,
} from "./utils";

type OrderStatus = Order["status"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["id"];
type ChannelFilter = "all" | "ifood" | "whatsapp";
type FulfillmentFilter = "all" | "delivery" | "pickup";
type PaymentFilter = "all" | "online" | "cash" | "card" | "other";
type SortKey = "order" | "customer" | "channel" | "items" | "value" | "payment" | "status" | "time";
type IfoodAction = "confirm" | "dispatch" | "ready_to_pickup" | "cancellation_reasons" | "request_cancellation";

type RestaurantConfig = {
  id: string;
  name?: string | null;
};

const LOCAL_CANCELLATION_REASONS: IfoodCancellationReason[] = [
  { code: "ITEM_UNAVAILABLE", description: "Um ou mais itens ficaram indisponíveis" },
  { code: "DELIVERY_UNAVAILABLE", description: "Não foi possível realizar a entrega" },
  { code: "STORE_OPERATION", description: "A loja não conseguirá atender o pedido" },
  { code: "CUSTOMER_REQUEST", description: "Cancelamento solicitado pelo cliente" },
  { code: "OTHER", description: "Outro motivo" },
];

const STATUS_PRIORITY: Record<OrderStatus, number> = {
  pending: 0,
  preparing: 1,
  delivering: 2,
  done: 3,
  canceled: 4,
};

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatSelectedDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getChannel(order: Order): Exclude<ChannelFilter, "all"> {
  return isIfoodOrder(order) ? "ifood" : "whatsapp";
}

function getChannelLabel(order: Order) {
  return getChannel(order) === "ifood" ? "iFood" : "WhatsApp";
}

function getFulfillment(order: Order): Exclude<FulfillmentFilter, "all"> {
  if (order.address?.fulfillment_type === "pickup") return "pickup";
  return formatIfoodOrderType(order) === "Retirada" ? "pickup" : "delivery";
}

function getFulfillmentLabel(order: Order) {
  return getFulfillment(order) === "pickup" ? "Retirada" : "Entrega";
}

function getPaymentCategory(order: Order): Exclude<PaymentFilter, "all"> {
  const payment = `${order.payment_method || ""} ${formatIfoodPayment(order) || ""}`.toLowerCase();
  if (/dinheiro|cash/.test(payment)) return "cash";
  if (/cart[aã]o|cr[eé]dito|d[eé]bito|credit|debit|card/.test(payment)) return "card";
  if (/pix|online|prepaid|wallet|digital|pago pelo app/.test(payment)) return "online";
  return "other";
}

function getPrimaryActionLabel(order: Order) {
  if (order.status === "pending") return "Confirmar";
  if (order.status === "preparing") return getFulfillment(order) === "pickup" ? "Pronto" : "Despachar";
  if (order.status === "delivering") return "Concluir";
  return "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function OrdersWorkspace() {
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurant, setRestaurant] = useState<RestaurantConfig | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc");
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const [eventsByOrder, setEventsByOrder] = useState<Record<string, IfoodEventAudit[]>>({});
  const [busyKey, setBusyKey] = useState("");
  const [cancellationOrder, setCancellationOrder] = useState<Order | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<IfoodCancellationReason[]>([]);
  const [cancellationCode, setCancellationCode] = useState("");
  const [cancellationText, setCancellationText] = useState("");

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setErrorMsg("");

    try {
      const { restaurant: currentRestaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) {
        router.replace("/admin/login");
        return;
      }
      if (!currentRestaurant) {
        setErrorMsg("Não foi possível localizar a loja.");
        return;
      }

      setRestaurant(currentRestaurant);
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, external_source, external_order_id, external_display_id, external_payload, is_test, scheduled_for, created_at, address, change_for, order_items (*)")
        .eq("restaurant_id", currentRestaurant.id)
        .in("status", ["pending", "preparing", "delivering", "done", "canceled"])
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      type OrderRow = Omit<Order, "items"> & { order_items?: Order["items"] | null };
      setOrders(
        ((data || []) as OrderRow[]).map((order) => ({
          ...order,
          items: order.order_items || [],
        })) as Order[],
      );
    } catch (error) {
      console.error(error);
      setErrorMsg("Não foi possível carregar os pedidos.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!restaurant?.id) return;

    const channel = supabase
      .channel(`orders-workspace-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => void fetchOrders(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchOrders, restaurant?.id, supabase]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const sync = async () => {
      try {
        const response = await fetch("/api/integrations/ifood/orders/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restaurantId: restaurant.id }),
        });
        if (response.ok) await fetchOrders(false);
      } catch {
        // A fila e o cron continuam responsáveis pelas próximas tentativas.
      }
    };

    const interval = window.setInterval(sync, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchOrders, restaurant?.id]);

  const dateOrders = useMemo(
    () =>
      orders.filter((order) => {
        const createdMatches = toLocalDateKey(order.created_at) === selectedDate;
        const scheduledMatches = order.scheduled_for ? toLocalDateKey(order.scheduled_for) === selectedDate : false;
        return createdMatches || scheduledMatches;
      }),
    [orders, selectedDate],
  );

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    const result = dateOrders.filter((order) => {
      const searchText = [
        order.id,
        formatDisplayNumber(order),
        order.customer_name,
        order.customer_phone,
        ...order.items.map((item) => item.product_name || item.name || ""),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return (
        (!term || searchText.includes(term)) &&
        (activeStatus === "all" || order.status === activeStatus) &&
        (channelFilter === "all" || getChannel(order) === channelFilter) &&
        (fulfillmentFilter === "all" || getFulfillment(order) === fulfillmentFilter) &&
        (paymentFilter === "all" || getPaymentCategory(order) === paymentFilter)
      );
    });

    return result.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "order") comparison = formatDisplayNumber(a).localeCompare(formatDisplayNumber(b), "pt-BR", { numeric: true });
      if (sortKey === "customer") comparison = a.customer_name.localeCompare(b.customer_name, "pt-BR");
      if (sortKey === "channel") comparison = getChannelLabel(a).localeCompare(getChannelLabel(b), "pt-BR");
      if (sortKey === "items") comparison = a.items.length - b.items.length;
      if (sortKey === "value") comparison = Number(a.total || 0) - Number(b.total || 0);
      if (sortKey === "payment") comparison = formatIfoodPayment(a).localeCompare(formatIfoodPayment(b), "pt-BR");
      if (sortKey === "status") comparison = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (sortKey === "time") comparison = new Date(a.scheduled_for || a.created_at).getTime() - new Date(b.scheduled_for || b.created_at).getTime();
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [activeStatus, channelFilter, dateOrders, fulfillmentFilter, paymentFilter, query, sortDirection, sortKey]);

  const summary = useMemo(() => {
    const validOrders = dateOrders.filter((order) => order.status !== "canceled");
    const revenue = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return {
      count: dateOrders.length,
      visible: filteredOrders.length,
      revenue,
      average: validOrders.length ? revenue / validOrders.length : 0,
      pending: dateOrders.filter((order) => order.status === "pending").length,
      preparing: dateOrders.filter((order) => order.status === "preparing").length,
      delivering: dateOrders.filter((order) => order.status === "delivering").length,
      canceled: dateOrders.filter((order) => order.status === "canceled").length,
    };
  }, [dateOrders, filteredOrders.length]);

  const activeFilterCount = [activeStatus !== "all", channelFilter !== "all", fulfillmentFilter !== "all", paymentFilter !== "all"].filter(Boolean).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "time" || key === "value" ? "desc" : "asc");
  };

  const clearFilters = () => {
    setQuery("");
    setActiveStatus("all");
    setChannelFilter("all");
    setFulfillmentFilter("all");
    setPaymentFilter("all");
  };

  const updateLocalStatus = async (order: Order, status: OrderStatus, cancellationReason = "") => {
    setBusyKey(`${order.id}:status`);
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, cancellationReason: status === "canceled" ? cancellationReason : undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o pedido.");
      await fetchOrders(false);
      showToast({ title: "Pedido atualizado", description: `Pedido #${formatDisplayNumber(order)} agora está como ${getStatusLabel(status).toLowerCase()}.`, tone: "success" });
      return true;
    } catch (error) {
      showToast({ title: "Falha ao atualizar", description: error instanceof Error ? error.message : "Tente novamente.", tone: "error" });
      return false;
    } finally {
      setBusyKey("");
    }
  };

  const runIfoodAction = async (order: Order, action: IfoodAction, options: Record<string, unknown> = {}) => {
    setBusyKey(`${order.id}:${action}`);
    try {
      const response = await fetch("/api/integrations/ifood/orders/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action, ...options }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "A integração não aceitou a ação.");
      if (action !== "cancellation_reasons") {
        await fetchOrders(false);
        showToast({ title: "Pedido atualizado", description: `A ação foi concluída no pedido #${formatDisplayNumber(order)}.`, tone: "success" });
      }
      return result;
    } catch (error) {
      showToast({ title: "Falha na integração", description: error instanceof Error ? error.message : "Tente novamente.", tone: "error" });
      return null;
    } finally {
      setBusyKey("");
    }
  };

  const handlePrimaryAction = async (order: Order) => {
    if (order.status === "pending") {
      if (isIfoodOrder(order)) await runIfoodAction(order, "confirm");
      else await updateLocalStatus(order, "preparing");
      return;
    }
    if (order.status === "preparing") {
      if (isIfoodOrder(order)) await runIfoodAction(order, getFulfillment(order) === "pickup" ? "ready_to_pickup" : "dispatch");
      else await updateLocalStatus(order, getFulfillment(order) === "pickup" ? "done" : "delivering");
      return;
    }
    if (order.status === "delivering") await updateLocalStatus(order, "done");
  };

  const openCancellation = async (order: Order) => {
    const reasons = isIfoodOrder(order)
      ? normalizeCancellationReasons(await runIfoodAction(order, "cancellation_reasons"))
      : LOCAL_CANCELLATION_REASONS;
    if (!reasons.length) return;
    setCancellationOrder(order);
    setCancellationReasons(reasons);
    setCancellationCode(reasons[0].code);
    setCancellationText(reasons[0].description);
  };

  const submitCancellation = async () => {
    if (!cancellationOrder || !cancellationCode || !cancellationText.trim()) return;
    const success = isIfoodOrder(cancellationOrder)
      ? await runIfoodAction(cancellationOrder, "request_cancellation", { cancellationCode, reason: cancellationText.trim() })
      : await updateLocalStatus(cancellationOrder, "canceled", cancellationText.trim());
    if (success) setCancellationOrder(null);
  };

  const loadEvents = async (order: Order) => {
    if (!isIfoodOrder(order) || eventsByOrder[order.id]) return;
    try {
      const response = await fetch(`/api/integrations/ifood/orders/events?orderId=${encodeURIComponent(order.id)}`);
      const result = await response.json().catch(() => ({}));
      if (response.ok) setEventsByOrder((current) => ({ ...current, [order.id]: result.events || [] }));
    } catch {
      setEventsByOrder((current) => ({ ...current, [order.id]: [] }));
    }
  };

  const toggleDetails = (order: Order) => {
    const opening = !expandedOrders.includes(order.id);
    setExpandedOrders((current) => (opening ? [...current, order.id] : current.filter((id) => id !== order.id)));
    if (opening) void loadEvents(order);
  };

  const printOrder = (order: Order) => {
    const popup = window.open("", "", "width=420,height=720");
    if (!popup) return;
    const items = order.items
      .map((item) => `<li>${escapeHtml(item.quantity || 1)}x ${escapeHtml(item.product_name || item.name || "Item")} — ${escapeHtml(formatPrice(Number(item.price || 0)))}</li>`)
      .join("");
    popup.document.write(`<!doctype html><html><head><title>Pedido #${escapeHtml(formatDisplayNumber(order))}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px}li{margin:8px 0}.total{font-size:18px;font-weight:700}</style></head><body><h1>Pedido #${escapeHtml(formatDisplayNumber(order))}</h1><p>${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_phone)}</p><p>${escapeHtml(formatDateTime(order.created_at))}</p><ul>${items}</ul><p class="total">Total: ${escapeHtml(formatPrice(Number(order.total || 0)))}</p></body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  };

  if (loading) return <OrdersSkeleton />;

  if (errorMsg) {
    return (
      <AdminPageShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p className="font-bold">{errorMsg}</p>
          <AdminButton className="mt-4" onClick={() => void fetchOrders()}>Tentar novamente</AdminButton>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="space-y-5 pb-12">
      {cancellationOrder ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Cancelar pedido</p>
                <h2 className="mt-2 text-xl font-black">Pedido #{formatDisplayNumber(cancellationOrder)}</h2>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setCancellationOrder(null)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <label className="mt-5 block text-sm font-bold" htmlFor="cancel-reason">Motivo</label>
            <AdminSelect id="cancel-reason" className="mt-2" value={cancellationCode} onChange={(event) => {
              const next = event.target.value;
              setCancellationCode(next);
              setCancellationText(cancellationReasons.find((reason) => reason.code === next)?.description || "");
            }}>
              {cancellationReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.description}</option>)}
            </AdminSelect>
            <label className="mt-4 block text-sm font-bold" htmlFor="cancel-text">Mensagem</label>
            <textarea id="cancel-text" rows={4} value={cancellationText} onChange={(event) => setCancellationText(event.target.value)} className="admin-control mt-2 min-h-28 resize-none" />
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <AdminButton variant="secondary" onClick={() => setCancellationOrder(null)}>Voltar</AdminButton>
              <AdminButton variant="danger" disabled={!cancellationText.trim() || Boolean(busyKey)} onClick={() => void submitCancellation()}>Confirmar cancelamento</AdminButton>
            </div>
          </div>
        </div>
      ) : null}

      <AdminPageHeader
        title="Pedidos"
        description="Acompanhe, filtre e atualize os pedidos da operação."
        icon={<ShoppingBag size={23} />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Data dos pedidos</span>
              <CalendarDays size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <AdminInput type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-[180px] pl-10" />
            </label>
            <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700">
              <LiveStatusDot /> Loja aberta
            </div>
          </div>
        }
      />

      <section className="surface-card w-full rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Resumo do dia</p>
            <h2 className="mt-1 text-xl font-black text-gray-950">{formatSelectedDate(selectedDate)}</h2>
          </div>
          <p className="text-sm font-semibold text-gray-500">{summary.visible} de {summary.count} pedidos visíveis</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ["Pedidos", summary.count, <ClipboardList key="orders" size={18} />],
            ["Pendentes", summary.pending, <ShoppingBag key="pending" size={18} />],
            ["Em preparo", summary.preparing, <Package key="preparing" size={18} />],
            ["Em rota", summary.delivering, <CheckCircle2 key="route" size={18} />],
            ["Faturamento", formatPrice(summary.revenue), <WalletCards key="revenue" size={18} />],
            ["Ticket médio", formatPrice(summary.average), <WalletCards key="average" size={18} />],
          ].map(([label, value, icon]) => (
            <div key={String(label)} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center gap-2 text-[var(--brand)]">{icon}<span className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">{label}</span></div>
              <p className="mt-3 text-2xl font-black text-gray-950">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Pesquisar pedidos</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <AdminInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, telefone, produto ou número..." className="pl-11" />
          </label>
          <AdminButton variant="secondary" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}>
            <Filter size={17} /> Filtros {activeFilterCount ? <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-xs text-[var(--brand)]">{activeFilterCount}</span> : null}
            <ChevronDown size={16} className={filtersOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </AdminButton>
        </div>

        {filtersOpen ? (
          <div className="surface-card grid gap-3 rounded-[20px] p-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-bold text-gray-600">Situação<AdminSelect className="mt-2" value={activeStatus} onChange={(event) => setActiveStatus(event.target.value as StatusFilter)}>{STATUS_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</AdminSelect></label>
            <label className="text-sm font-bold text-gray-600">Canal<AdminSelect className="mt-2" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}><option value="all">Todos</option><option value="ifood">iFood</option><option value="whatsapp">WhatsApp</option></AdminSelect></label>
            <label className="text-sm font-bold text-gray-600">Tipo de atendimento<AdminSelect className="mt-2" value={fulfillmentFilter} onChange={(event) => setFulfillmentFilter(event.target.value as FulfillmentFilter)}><option value="all">Todos</option><option value="delivery">Entrega</option><option value="pickup">Retirada</option></AdminSelect></label>
            <label className="text-sm font-bold text-gray-600">Pagamento<AdminSelect className="mt-2" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}><option value="all">Todos</option><option value="online">Online/Pix</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="other">Outros</option></AdminSelect></label>
            <div className="sm:col-span-2 xl:col-span-4 flex justify-end"><AdminButton variant="ghost" onClick={clearFilters}><RefreshCw size={16} /> Limpar filtros</AdminButton></div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white shadow-sm">
        <div className="hidden grid-cols-[100px_1.2fr_110px_75px_90px_135px_115px_90px_150px] items-center gap-2 border-b border-[var(--line)] bg-[#fffdfa] px-4 py-3 text-[10px] uppercase tracking-[0.06em] xl:grid">
          <SortableTableHeader label="Pedido" active={sortKey === "order"} direction={sortKey === "order" ? sortDirection : null} onClick={() => toggleSort("order")} className="justify-center" />
          <SortableTableHeader label="Cliente" active={sortKey === "customer"} direction={sortKey === "customer" ? sortDirection : null} onClick={() => toggleSort("customer")} className="justify-center" />
          <SortableTableHeader label="Canal" active={sortKey === "channel"} direction={sortKey === "channel" ? sortDirection : null} onClick={() => toggleSort("channel")} className="justify-center" />
          <SortableTableHeader label="Itens" active={sortKey === "items"} direction={sortKey === "items" ? sortDirection : null} onClick={() => toggleSort("items")} className="justify-center" />
          <SortableTableHeader label="Valor" active={sortKey === "value"} direction={sortKey === "value" ? sortDirection : null} onClick={() => toggleSort("value")} className="justify-center" />
          <SortableTableHeader label="Método de pagamento" active={sortKey === "payment"} direction={sortKey === "payment" ? sortDirection : null} onClick={() => toggleSort("payment")} className="justify-center whitespace-nowrap" />
          <SortableTableHeader label="Status" active={sortKey === "status"} direction={sortKey === "status" ? sortDirection : null} onClick={() => toggleSort("status")} className="justify-center" />
          <SortableTableHeader label="Horário" active={sortKey === "time"} direction={sortKey === "time" ? sortDirection : null} onClick={() => toggleSort("time")} className="justify-center" />
          <span className="text-center font-bold text-gray-400">Ações</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Package className="mx-auto text-orange-300" size={48} />
            <p className="mt-4 font-black text-gray-950">Nenhum pedido encontrado</p>
            <p className="mt-1 text-sm text-gray-500">Altere a data, a busca ou os filtros selecionados.</p>
            <AdminButton variant="secondary" className="mt-5" onClick={clearFilters}><RefreshCw size={16} /> Limpar filtros</AdminButton>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {filteredOrders.map((order) => {
              const expanded = expandedOrders.includes(order.id);
              const actionLabel = getPrimaryActionLabel(order);
              const payment = formatIfoodPayment(order) || order.payment_method || "Não informado";
              const events = eventsByOrder[order.id] || [];
              return (
                <article key={order.id} className={order.status === "pending" ? "bg-orange-50/25" : "bg-white"}>
                  <div className="hidden grid-cols-[100px_1.2fr_110px_75px_90px_135px_115px_90px_150px] items-center gap-2 px-4 py-4 text-center xl:grid">
                    <div><p className="font-black">#{formatDisplayNumber(order)}</p><p className="mt-1 text-[11px] text-gray-500">{formatDate(order.created_at)}</p></div>
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{order.customer_name}</p><p className="mt-1 truncate text-[11px] text-gray-500">{order.customer_phone}</p></div>
                    <div><p className="text-xs font-black">{getChannelLabel(order)}</p><p className="mt-1 text-[10px] text-gray-500">{getFulfillmentLabel(order)}</p></div>
                    <p className="text-sm font-black">{order.items.length}</p>
                    <p className="text-sm font-black">{formatPrice(Number(order.total || 0))}</p>
                    <p className="break-words text-xs font-bold leading-4 text-gray-700">{payment}</p>
                    <div className="flex justify-center"><OrderStatusBadge status={order.status} className="font-black" /></div>
                    <div><p className="text-xs font-black">{formatTime(order.scheduled_for || order.created_at)}</p>{order.scheduled_for ? <p className="mt-1 text-[10px] font-bold text-amber-700">Agendado</p> : null}</div>
                    <div className="flex justify-center gap-1">{actionLabel ? <button type="button" disabled={busyKey.startsWith(order.id)} onClick={() => void handlePrimaryAction(order)} className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--brand)] px-2.5 text-[11px] font-black text-white disabled:opacity-50">{busyKey.startsWith(order.id) ? "..." : actionLabel}</button> : null}<button type="button" onClick={() => printOrder(order)} aria-label="Imprimir" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] text-gray-600 hover:text-[var(--brand)]"><Printer size={16} /></button><button type="button" onClick={() => toggleDetails(order)} aria-label="Ver detalhes" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] text-gray-600 hover:text-[var(--brand)]"><Eye size={16} /></button></div>
                  </div>

                  <div className="p-4 xl:hidden">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black">#{formatDisplayNumber(order)}</p><p className="mt-1 text-sm font-semibold text-gray-600">{order.customer_name}</p></div><OrderStatusBadge status={order.status} className="font-black" /></div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs font-bold uppercase text-gray-400">Horário</p><p className="mt-1 font-bold">{formatTime(order.scheduled_for || order.created_at)}</p></div><div><p className="text-xs font-bold uppercase text-gray-400">Valor</p><p className="mt-1 font-black">{formatPrice(Number(order.total || 0))}</p></div><div><p className="text-xs font-bold uppercase text-gray-400">Canal</p><p className="mt-1 font-bold">{getChannelLabel(order)} · {getFulfillmentLabel(order)}</p></div><div><p className="text-xs font-bold uppercase text-gray-400">Itens</p><p className="mt-1 font-bold">{order.items.length}</p></div></div>
                    <div className="mt-4 flex gap-2">{actionLabel ? <AdminButton className="flex-1" disabled={busyKey.startsWith(order.id)} onClick={() => void handlePrimaryAction(order)}>{actionLabel}</AdminButton> : null}<AdminButton variant="secondary" onClick={() => toggleDetails(order)}><Eye size={16} /><span className="sr-only">Detalhes</span></AdminButton></div>
                  </div>

                  {expanded ? (
                    <div className="border-t border-[var(--line)] bg-[#fffdfa] p-4 sm:p-5">
                      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_260px]">
                        <div><h3 className="font-black">Itens do pedido</h3><div className="mt-3 space-y-2">{order.items.map((item: OrderItem, index) => <div key={`${item.product_name}-${index}`} className="rounded-2xl border border-[var(--line)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.quantity || 1}x {item.product_name || item.name || "Item"}</p>{item.addons?.length ? <p className="mt-1 text-sm text-gray-500">{item.addons.map(getAddonLabel).join(", ")}</p> : null}{item.observation ? <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800">Obs.: {item.observation}</p> : null}</div><strong>{formatPrice(Number(item.price || 0))}</strong></div></div>)}</div></div>
                        <div className="space-y-3"><div className="rounded-2xl border border-[var(--line)] bg-white p-4"><div className="flex gap-3"><MapPin size={18} className="mt-0.5 text-[var(--brand)]" /><div><p className="font-black">{getFulfillmentLabel(order)}</p><p className="mt-1 text-sm leading-6 text-gray-600">{order.address?.street || "Endereço não informado"}, {order.address?.number || "S/N"}<br />{order.address?.neighborhood || ""}</p></div></div></div>{listIfoodBenefits(order).length ? <div className="rounded-2xl border border-[var(--line)] bg-white p-4"><p className="font-black">Benefícios</p>{listIfoodBenefits(order).map((benefit, index) => <p key={index} className="mt-2 text-sm text-gray-600">{getIfoodBenefitLabel(benefit)}: {formatPrice(getIfoodBenefitAmount(benefit))}</p>)}</div> : null}{isIfoodOrder(order) ? <div className="rounded-2xl border border-[var(--line)] bg-white p-4"><p className="font-black">Linha do tempo iFood</p>{events.length ? events.map((event) => <div key={event.id} className="mt-3 border-l-2 border-orange-200 pl-3"><p className="text-sm font-bold">{event.event_code}</p><p className="text-xs text-gray-500">{formatDateTime(event.event_created_at || event.created_at)}</p></div>) : <p className="mt-2 text-sm text-gray-500">Nenhum evento registrado.</p>}</div> : null}</div>
                        <div className="space-y-3"><div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm"><div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatPrice(Number(order.subtotal || 0))}</span></div><div className="mt-2 flex justify-between text-gray-500"><span>Entrega</span><span>{formatPrice(Number(order.delivery_fee || 0))}</span></div><div className="mt-2 flex justify-between text-gray-500"><span>Desconto</span><span>{formatPrice(Number(order.discount || 0))}</span></div><div className="mt-3 flex justify-between border-t border-[var(--line)] pt-3 font-black"><span>Total</span><span>{formatPrice(Number(order.total || 0))}</span></div><p className="mt-3 text-xs text-gray-500">Pagamento: {payment}</p>{calculateCashChange(order.change_for, order.total) ? <p className="mt-1 text-xs font-bold text-gray-700">Troco: {formatPrice(calculateCashChange(order.change_for, order.total)?.change || 0)}</p> : null}</div><AdminButton variant="secondary" className="w-full" onClick={() => printOrder(order)}><Printer size={16} /> Imprimir</AdminButton>{actionLabel ? <AdminButton className="w-full" disabled={busyKey.startsWith(order.id)} onClick={() => void handlePrimaryAction(order)}>{actionLabel}</AdminButton> : null}{(order.status === "pending" || order.status === "preparing") ? <AdminButton variant="danger" className="w-full" disabled={busyKey.startsWith(order.id)} onClick={() => void openCancellation(order)}><XCircle size={16} /> Cancelar pedido</AdminButton> : null}</div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
