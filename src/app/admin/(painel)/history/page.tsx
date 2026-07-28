"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  MessageCircle,
  Package,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { PERIOD_OPTIONS, PeriodKey, isWithinPeriod } from "@/lib/admin-period";
import { useToast } from "@/components/ui/toast-provider";
import { OrderStatusBadge } from "@/components/ui/order-status-badge";
import { getOrderStatusLabel } from "@/lib/order-status";

type HistoryOrderItem = {
  product_name?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  observation?: string | null;
  addons?: Array<{
    name?: string | null;
    title?: string | null;
    description?: string | null;
    price?: number | string | null;
  }> | null;
};

type HistoryOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  status: "pending" | "preparing" | "delivering" | "done" | "canceled";
  payment_method: string;
  display_number?: number | null;
  created_at: string;
  order_items?: HistoryOrderItem[] | null;
};

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Em aberto" },
  { id: "done", label: "Concluídos" },
  { id: "canceled", label: "Cancelados" },
];

const PAGE_SIZE = 20;

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatHour(date: string) {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDayLabel(date: string) {
  const target = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  if (sameDay) return "Hoje";

  const isYesterday =
    target.getFullYear() === yesterday.getFullYear() &&
    target.getMonth() === yesterday.getMonth() &&
    target.getDate() === yesterday.getDate();

  if (isYesterday) return "Ontem";

  return target.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function getStatusLabel(status: HistoryOrder["status"]) {
  return getOrderStatusLabel(status);
}

function getOrderNumber(order: HistoryOrder) {
  return order.display_number ? String(order.display_number) : order.id.slice(0, 4);
}

function getOrderItems(order: HistoryOrder) {
  return order.order_items || [];
}

function getItemName(item: HistoryOrderItem) {
  return item.product_name?.trim() || item.name?.trim() || "Produto sem nome";
}

function getItemAddons(item: HistoryOrderItem) {
  return (item.addons || [])
    .map((addon) => addon.name || addon.title || addon.description || "")
    .filter(Boolean);
}

function getItemsExportText(order: HistoryOrder) {
  const items = getOrderItems(order);
  if (items.length === 0) return "Não informado";
  return items
    .map((item) => `${Number(item.quantity || 1)}x ${getItemName(item)}`)
    .join(" | ");
}

function exportExcel(rows: HistoryOrder[]) {
  const header = [
    "Data",
    "Hora",
    "Pedido",
    "Cliente",
    "Telefone",
    "Produtos",
    "Situação",
    "Pagamento",
    "Subtotal",
    "Entrega",
    "Desconto",
    "Total",
  ];

  const lines = rows.map((order) => [
    formatDate(order.created_at),
    formatHour(order.created_at),
    getOrderNumber(order),
    order.customer_name,
    order.customer_phone,
    getItemsExportText(order),
    getStatusLabel(order.status),
    order.payment_method,
    Number(order.subtotal || 0).toFixed(2),
    Number(order.delivery_fee || 0).toFixed(2),
    Number(order.discount || 0).toFixed(2),
    Number(order.total || 0).toFixed(2),
  ]);

  const worksheet = [header, ...lines]
    .map((line) => line.map((value) => String(value)).join("\t"))
    .join("\n");

  const blob = new Blob([`\uFEFF${worksheet}`], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "historico-pedidos.xls";
  anchor.click();
  URL.revokeObjectURL(url);
}

function HistorySkeleton() {
  return (
    <div className="admin-page-shell animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-40 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
      </div>
      <div className="surface-card rounded-[28px] p-6">
        <div className="h-12 rounded-2xl bg-white" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 rounded-2xl bg-white" />
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { restaurant, user } = await getCurrentRestaurant(supabase);
        if (!user) {
          router.push("/admin/login");
          return;
        }

        if (!restaurant) {
          setErrorMsg("Não foi possível localizar a loja.");
          return;
        }

        const { data, error } = await supabase
          .from("orders")
          .select(
            "id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, display_number, created_at, order_items (*)",
          )
          .eq("restaurant_id", restaurant.id)
          .order("created_at", { ascending: false });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        setOrders((data || []) as HistoryOrder[]);
      } catch (error) {
        console.error(error);
        setErrorMsg("Erro ao carregar o histórico.");
      } finally {
        setLoading(false);
      }
    };

    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesPeriod = isWithinPeriod(order.created_at, period);
      const matchesCustomPeriod =
        period !== "custom"
          ? true
          : isWithinPeriod(order.created_at, period, {
              start: customStartDate,
              end: customEndDate,
            });

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "pending"
            ? ["pending", "preparing", "delivering"].includes(order.status)
            : order.status === filter;

      const itemsText = getOrderItems(order)
        .map((item) => getItemName(item))
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        term.length === 0 ||
        order.id.toLowerCase().includes(term) ||
        getOrderNumber(order).toLowerCase().includes(term) ||
        order.customer_name.toLowerCase().includes(term) ||
        order.customer_phone.toLowerCase().includes(term) ||
        String(order.payment_method || "").toLowerCase().includes(term) ||
        itemsText.includes(term);

      return (
        (period === "custom" ? matchesCustomPeriod : matchesPeriod) &&
        matchesFilter &&
        matchesSearch
      );
    });
  }, [customEndDate, customStartDate, filter, orders, period, query]);

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const paginatedOrders = visibleOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const groupedOrders = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      orders: HistoryOrder[];
      total: number;
    }> = [];

    paginatedOrders.forEach((order) => {
      const key = formatDate(order.created_at);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.key !== key) {
        groups.push({
          key,
          label: getDayLabel(order.created_at),
          orders: [order],
          total: Number(order.status === "canceled" ? 0 : order.total || 0),
        });
        return;
      }

      lastGroup.orders.push(order);
      lastGroup.total += Number(order.status === "canceled" ? 0 : order.total || 0);
    });

    return groups;
  }, [paginatedOrders]);

  const summary = useMemo(() => {
    const validOrders = visibleOrders.filter((order) => order.status !== "canceled");
    const totalSales = validOrders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    );

    return {
      count: visibleOrders.length,
      value: totalSales,
      ticket: validOrders.length > 0 ? totalSales / validOrders.length : 0,
      canceled: visibleOrders.filter((order) => order.status === "canceled").length,
    };
  }, [visibleOrders]);

  const activeFilterLabel = FILTERS.find((item) => item.id === filter)?.label || "Todos";
  const activePeriodLabel = PERIOD_OPTIONS.find((item) => item.id === period)?.label || "30 dias";

  useEffect(() => {
    setPage(1);
  }, [customEndDate, customStartDate, query, filter, period]);

  const selectPeriod = (nextPeriod: PeriodKey) => {
    setPeriod(nextPeriod);

    if (nextPeriod === "custom" && (!customStartDate || !customEndDate)) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      setCustomStartDate(formatInputDate(start));
      setCustomEndDate(formatInputDate(end));
    }
  };

  const handleCopyOrder = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      showToast({
        title: "Pedido copiado",
        description: "O identificador completo foi copiado para a área de transferência.",
        tone: "success",
      });
    } catch {
      showToast({
        title: "Não foi possível copiar",
        description: "Tente novamente em alguns segundos.",
        tone: "error",
      });
    }
  };

  if (loading) return <HistorySkeleton />;

  if (errorMsg) {
    return (
      <div className="admin-page-shell rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:mb-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="brand-gradient flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm sm:h-14 sm:w-14">
            <History size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">
              Histórico
            </h1>
            <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">
              Consulte pedidos, produtos vendidos e valores em um só lugar.
            </p>
          </div>
        </div>

        <button
          onClick={() => exportExcel(visibleOrders)}
          aria-label="Exportar histórico"
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-gray-700 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-3 sm:text-sm sm:font-bold"
        >
          <Download size={17} />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>

      <section className="surface-card rounded-[24px] p-3 sm:rounded-[28px] sm:p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <Search size={18} className="flex-shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente, telefone, pagamento ou produto"
              className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFiltersOpen((current) => !current)}
            aria-expanded={isFiltersOpen}
            className="inline-flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-left lg:min-w-[250px]"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <SlidersHorizontal size={17} className="flex-shrink-0 text-gray-500" />
              <span className="font-bold text-gray-700">Filtros</span>
            </span>
            <span className="min-w-0 truncate text-xs font-semibold text-gray-400">
              {activeFilterLabel} · {activePeriodLabel}
            </span>
          </button>
        </div>

        {isFiltersOpen && (
          <div className="mt-3 grid gap-3 rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-bold text-gray-700">
              Situação
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-semibold outline-none"
              >
                {FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2 text-sm font-bold text-gray-700">
              Período
              <select
                value={period}
                onChange={(event) => selectPeriod(event.target.value as PeriodKey)}
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-semibold outline-none"
              >
                {PERIOD_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            {period === "custom" && (
              <>
                <label className="flex flex-col gap-2 text-sm font-semibold text-gray-700">
                  Data inicial
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-gray-700">
                  Data final
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    min={customStartDate || undefined}
                    className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none"
                  />
                </label>
              </>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pedidos", value: String(summary.count) },
            { label: "Vendas", value: formatMoney(summary.value) },
            { label: "Ticket médio", value: formatMoney(summary.ticket) },
            { label: "Cancelados", value: String(summary.canceled) },
          ].map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
                {metric.label}
              </p>
              <p className="mt-1 text-lg font-black text-gray-950">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-500">
            {visibleOrders.length} pedido{visibleOrders.length === 1 ? "" : "s"} encontrado{visibleOrders.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
          {paginatedOrders.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-gray-500">
              Nenhum pedido encontrado para este filtro.
            </div>
          ) : (
            groupedOrders.map((group) => (
              <div key={group.key} className="border-b border-[var(--line)] last:border-b-0">
                <div className="flex items-center justify-between gap-3 bg-[#fcfaf7] px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black capitalize text-gray-950">
                      {group.label}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {group.orders.length} pedido{group.orders.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-bold text-gray-600">
                    {formatMoney(group.total)}
                  </p>
                </div>

                <div className="divide-y divide-[var(--line)]">
                  {group.orders.map((order) => {
                    const orderItems = getOrderItems(order);
                    return (
                      <details key={order.id} className="group bg-white">
                        <summary className="list-none cursor-pointer px-4 py-4 transition-colors hover:bg-[#fffdfa] sm:px-5 [&::-webkit-details-marker]:hidden">
                          <div className="flex items-start justify-between gap-3 lg:grid lg:grid-cols-[minmax(180px,0.85fr)_minmax(190px,1fr)_minmax(220px,1.2fr)_auto_auto] lg:items-center lg:gap-5">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="font-black text-gray-950">#{getOrderNumber(order)}</p>
                                <span className="text-xs font-semibold text-gray-400">
                                  {formatHour(order.created_at)} · {formatDate(order.created_at)}
                                </span>
                              </div>
                              <p className="mt-2 truncate text-sm font-semibold text-gray-700 lg:hidden">
                                {order.customer_name}
                              </p>
                            </div>

                            <div className="hidden min-w-0 lg:block">
                              <p className="truncate text-sm font-semibold text-gray-950">
                                {order.customer_name}
                              </p>
                              <p className="mt-1 truncate text-xs text-gray-400">Cliente do pedido</p>
                            </div>

                            <div className="hidden min-w-0 lg:block">
                              <p className="truncate text-sm font-semibold text-gray-700">
                                {orderItems.length > 0
                                  ? `${Number(orderItems[0].quantity || 1)}x ${getItemName(orderItems[0])}`
                                  : "Itens não informados"}
                              </p>
                              <p className="mt-1 text-xs text-gray-400">
                                {orderItems.length > 1
                                  ? `+ ${orderItems.length - 1} outro${orderItems.length - 1 === 1 ? " item" : "s itens"}`
                                  : "Produtos comprados"}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2 lg:contents">
                              <OrderStatusBadge status={order.status} className="whitespace-nowrap" />
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-sm font-black text-gray-950">
                                    {formatMoney(Number(order.total || 0))}
                                  </p>
                                  <span className="text-[11px] font-bold text-gray-400 sm:hidden">
                                    Ver detalhes
                                  </span>
                                </div>
                                <ChevronDown
                                  size={17}
                                  className="flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                                />
                              </div>
                            </div>
                          </div>
                        </summary>

                        <div className="border-t border-[var(--line)] bg-[#fcfaf7] px-4 py-4 sm:px-5">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
                            <section className="rounded-2xl border border-[var(--line)] bg-white p-4" aria-label={`Produtos do pedido ${getOrderNumber(order)}`}>
                              <div className="flex items-center gap-2">
                                <Package size={17} className="text-[var(--brand)]" />
                                <h3 className="text-sm font-black text-gray-950">Itens do pedido</h3>
                                <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand)]">
                                  {orderItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0)} item(ns)
                                </span>
                              </div>

                              {orderItems.length === 0 ? (
                                <p className="mt-4 text-sm text-gray-500">Os produtos deste pedido não foram informados.</p>
                              ) : (
                                <div className="mt-3 divide-y divide-[var(--line)]">
                                  {orderItems.map((item, itemIndex) => {
                                    const quantity = Number(item.quantity || 1);
                                    const addons = getItemAddons(item);
                                    return (
                                      <div key={`${order.id}-${getItemName(item)}-${itemIndex}`} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                                        <span className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff3e8] px-2 text-xs font-black text-[var(--brand)]">
                                          {quantity}x
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <p className="font-bold text-gray-800">{getItemName(item)}</p>
                                          {addons.length > 0 && (
                                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                              Adicionais: {addons.join(", ")}
                                            </p>
                                          )}
                                          {item.observation && (
                                            <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                              Observação: {item.observation}
                                            </p>
                                          )}
                                        </div>
                                        {Number(item.price || 0) > 0 && (
                                          <p className="shrink-0 text-sm font-bold text-gray-700">
                                            {formatMoney(Number(item.price || 0) * quantity)}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </section>

                            <section className="rounded-2xl border border-[var(--line)] bg-white p-4">
                              <h3 className="text-sm font-black text-gray-950">Resumo do pedido</h3>
                              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                                {[
                                  ["Telefone", order.customer_phone || "Não informado"],
                                  ["Pagamento", order.payment_method || "Não informado"],
                                  ["Subtotal", formatMoney(Number(order.subtotal || 0))],
                                  ["Entrega", formatMoney(Number(order.delivery_fee || 0))],
                                  ["Desconto", formatMoney(Number(order.discount || 0))],
                                  ["Total", formatMoney(Number(order.total || 0))],
                                ].map(([label, value]) => (
                                  <div key={label} className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
                                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-gray-400">{label}</p>
                                    <p className="max-w-[65%] truncate text-right font-semibold text-gray-700">{value}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          </div>

                          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                              onClick={() => handleCopyOrder(order.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold text-gray-600"
                            >
                              <Copy size={15} />
                              Copiar ID
                            </button>
                            <button
                              onClick={() =>
                                window.open(
                                  `https://wa.me/${order.customer_phone.replace(/\D/g, "")}`,
                                  "_blank",
                                )
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700"
                            >
                              <MessageCircle size={15} />
                              WhatsApp
                            </button>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {visibleOrders.length > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>Página {page} de {totalPages}</p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  Próxima
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
