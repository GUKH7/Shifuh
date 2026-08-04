"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleX,
  ClipboardList,
  Copy,
  Download,
  History,
  MessageCircle,
  Package,
  ReceiptText,
  Search,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { PERIOD_OPTIONS, type PeriodKey, isWithinPeriod } from "@/lib/admin-period";
import { useToast } from "@/components/ui/toast-provider";
import { OrderStatusBadge } from "@/components/ui/order-status-badge";
import { AdminEmptyState, AdminErrorState } from "@/components/ui/admin-page-states";
import { getOrderStatusLabel } from "@/lib/order-status";
import {
  AdminButton,
  AdminInput,
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
  AdminSkeleton,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/admin-primitives";

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

type SortKey = "created_at" | "id" | "customer_name" | "status" | "payment_method" | "total";

type HistoryGroup = {
  key: string;
  label: string;
  orders: HistoryOrder[];
  total: number;
};

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "open", label: "Em aberto" },
  { id: "done", label: "Concluídos" },
  { id: "canceled", label: "Cancelados" },
] as const;

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "created_at", label: "Data e horário" },
  { id: "id", label: "Número do pedido" },
  { id: "customer_name", label: "Cliente" },
  { id: "status", label: "Situação" },
  { id: "payment_method", label: "Pagamento" },
  { id: "total", label: "Valor" },
];

const PAGE_SIZE = 20;

const STATUS_PRIORITY: Record<HistoryOrder["status"], number> = {
  pending: 0,
  preparing: 1,
  delivering: 2,
  done: 3,
  canceled: 4,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  CREDIT: "CRÉDITO",
  CREDIT_CARD: "CRÉDITO",
  CARD_CREDIT: "CRÉDITO",
  DEBIT: "DÉBITO",
  DEBIT_CARD: "DÉBITO",
  CARD_DEBIT: "DÉBITO",
  PIX: "Pix",
  CARD: "Cartão",
  ONLINE: "Online",
};

function formatPaymentMethod(value?: string | null) {
  const rawValue = value?.trim() || "";
  if (!rawValue) return "Não informado";
  const normalizedValue = rawValue.toUpperCase().replace(/[\s-]+/g, "_");
  return PAYMENT_METHOD_LABELS[normalizedValue] || rawValue;
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

function formatPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") || "";

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return value?.trim() || "Não informado";
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDayLabel(date: string) {
  const target = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (isSameDay(target, now)) return "Hoje";
  if (isSameDay(target, yesterday)) return "Ontem";

  const label = target.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
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

function getItemsText(order: HistoryOrder) {
  return getOrderItems(order)
    .map((item) => `${Number(item.quantity || 1)}x ${getItemName(item)}`)
    .join(" | ");
}

function getSortValue(order: HistoryOrder, key: SortKey) {
  switch (key) {
    case "created_at":
      return new Date(order.created_at).getTime();
    case "id":
      return getOrderNumber(order).toLowerCase();
    case "customer_name":
      return order.customer_name.toLocaleLowerCase("pt-BR");
    case "status":
      return STATUS_PRIORITY[order.status];
    case "payment_method":
      return (order.payment_method || "").toLocaleLowerCase("pt-BR");
    case "total":
      return Number(order.total || 0);
  }
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
    getItemsText(order) || "Não informado",
    getStatusLabel(order.status),
    formatPaymentMethod(order.payment_method),
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

function HistoryWorkspaceSkeleton() {
  return (
    <AdminPageShell className="space-y-4 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <AdminSkeleton className="h-14 w-14" />
          <div className="space-y-2">
            <AdminSkeleton className="h-7 w-40" />
            <AdminSkeleton className="h-4 w-72 max-w-[70vw]" />
          </div>
        </div>
        <AdminSkeleton className="h-11 w-11 sm:w-28" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <AdminSkeleton className="h-11 flex-1" />
        <AdminSkeleton className="h-11 lg:w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <AdminSkeleton key={index} className="h-[84px] w-full" />
        ))}
      </div>
      <AdminSkeleton className="h-[520px] w-full" />
    </AdminPageShell>
  );
}

export function HistoryWorkspace() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<Exclude<SortDirection, null>>("desc");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);

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
  }, [router, supabase]);

  const paymentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          orders
            .map((order) => (order.payment_method || "").trim())
            .filter(Boolean),
        ),
      )
        .map((value) => ({ value, label: formatPaymentMethod(value) }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    const direction = sortDirection === "asc" ? 1 : -1;

    return orders
      .filter((order) => {
        const matchesPeriod =
          period === "custom"
            ? isWithinPeriod(order.created_at, period, {
                start: customStartDate,
                end: customEndDate,
              })
            : isWithinPeriod(order.created_at, period);

        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "open"
              ? ["pending", "preparing", "delivering"].includes(order.status)
              : order.status === statusFilter;

        const matchesPayment =
          paymentFilter === "all" ? true : order.payment_method === paymentFilter;

        const productText = getOrderItems(order)
          .map((item) => getItemName(item))
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        const matchesSearch =
          term.length === 0 ||
          order.id.toLocaleLowerCase("pt-BR").includes(term) ||
          getOrderNumber(order).toLocaleLowerCase("pt-BR").includes(term) ||
          order.customer_name.toLocaleLowerCase("pt-BR").includes(term) ||
          order.customer_phone.toLocaleLowerCase("pt-BR").includes(term) ||
          `${order.payment_method || ""} ${formatPaymentMethod(order.payment_method)}`.toLocaleLowerCase("pt-BR").includes(term) ||
          productText.includes(term);

        return matchesPeriod && matchesStatus && matchesPayment && matchesSearch;
      })
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction;
        }

        return String(leftValue).localeCompare(String(rightValue), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }) * direction;
      });
  }, [customEndDate, customStartDate, orders, paymentFilter, period, query, sortDirection, sortKey, statusFilter]);

  useEffect(() => {
    setPage(1);
    setCollapsedDates([]);
  }, [customEndDate, customStartDate, paymentFilter, period, query, sortDirection, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const paginatedOrders = visibleOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, HistoryGroup>();

    paginatedOrders.forEach((order) => {
      const key = formatDate(order.created_at);
      const current = groups.get(key);

      if (current) {
        current.orders.push(order);
        current.total += Number(order.status === "canceled" ? 0 : order.total || 0);
        return;
      }

      groups.set(key, {
        key,
        label: getDayLabel(order.created_at),
        orders: [order],
        total: Number(order.status === "canceled" ? 0 : order.total || 0),
      });
    });

    return Array.from(groups.values());
  }, [paginatedOrders]);

  const summary = useMemo(() => {
    const validOrders = visibleOrders.filter((order) => order.status !== "canceled");
    const value = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      count: visibleOrders.length,
      value,
      average: validOrders.length ? value / validOrders.length : 0,
      canceled: visibleOrders.filter((order) => order.status === "canceled").length,
    };
  }, [visibleOrders]);

  const activeFiltersCount = [
    statusFilter !== "all",
    paymentFilter !== "all",
    period !== "30d",
  ].filter(Boolean).length;

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "created_at" || key === "total" ? "desc" : "asc");
  };

  const toggleDateGroup = (key: string) => {
    setCollapsedDates((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const allCurrentGroupsCollapsed =
    groupedOrders.length > 0 && groupedOrders.every((group) => collapsedDates.includes(group.key));

  const toggleAllGroups = () => {
    const currentKeys = groupedOrders.map((group) => group.key);

    setCollapsedDates((current) => {
      if (allCurrentGroupsCollapsed) {
        return current.filter((key) => !currentKeys.includes(key));
      }

      return Array.from(new Set([...current, ...currentKeys]));
    });
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setPeriod("30d");
    setCustomStartDate("");
    setCustomEndDate("");
    setSortKey("created_at");
    setSortDirection("desc");
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

  if (loading) return <HistoryWorkspaceSkeleton />;

  if (errorMsg) {
    return <AdminErrorState description={errorMsg} />;
  }

  return (
    <AdminPageShell className="space-y-4 pb-12">
      <AdminPageHeader
        title="Histórico"
        description="Consulte pedidos, produtos vendidos e valores agrupados por data."
        icon={<History size={22} />}
        action={
          <AdminButton
            variant="filter"
            onClick={() => exportExcel(visibleOrders)}
            aria-label="Exportar histórico"
            disabled={!visibleOrders.length}
            className="h-11 w-full px-4 sm:w-auto"
          >
            <Download size={17} />
            <span>Exportar</span>
          </AdminButton>
        }
      />

      <section className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-0">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <AdminInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente ou produto"
              aria-label="Buscar no histórico por pedido, cliente, telefone, pagamento ou produto"
              className="pl-11"
            />
          </div>

          <AdminButton
            variant="filter"
            onClick={() => setFiltersOpen((current) => !current)}
            aria-expanded={filtersOpen}
            aria-controls="history-filters-panel"
            className="justify-between lg:min-w-[160px]"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal size={17} />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-[var(--brand)]">
                  {activeFiltersCount}
                </span>
              )}
            </span>
            <ChevronDown
              size={16}
              className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            />
          </AdminButton>
        </div>

        {filtersOpen && (
          <div
            id="history-filters-panel"
            className="admin-filter-panel grid gap-3 rounded-2xl p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"
          >
            <label className="space-y-2 text-sm font-bold text-gray-700">
              <span className="block">Situação</span>
              <AdminSelect className="admin-filter-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                {STATUS_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </AdminSelect>
            </label>

            <label className="space-y-2 text-sm font-bold text-gray-700">
              <span className="block">Período</span>
              <AdminSelect className="admin-filter-control" value={period} onChange={(event) => selectPeriod(event.target.value as PeriodKey)}>
                {PERIOD_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </AdminSelect>
            </label>

            <label className="space-y-2 text-sm font-bold text-gray-700">
              <span className="block">Pagamento</span>
              <AdminSelect className="admin-filter-control" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
                <option value="all">Todos</option>
                {paymentOptions.map((payment) => (
                  <option key={payment.value} value={payment.value}>{payment.label}</option>
                ))}
              </AdminSelect>
            </label>

            <label className="space-y-2 text-sm font-bold text-gray-700 lg:hidden">
              <span className="block">Ordenar por</span>
              <AdminSelect className="admin-filter-control" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                {SORT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </AdminSelect>
            </label>

            <div className="order-last flex flex-col items-stretch gap-2 sm:col-span-2 sm:flex-row sm:items-end xl:order-none xl:col-span-1 xl:justify-self-end">
              <AdminButton variant="filter" onClick={clearFilters} className="xl:min-w-[150px]">Limpar filtros</AdminButton>
              <AdminButton
                variant="secondary"
                onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                className="lg:hidden"
              >
                <ChevronsUpDown size={16} />
                {sortDirection === "asc" ? "Crescente" : "Decrescente"}
              </AdminButton>
            </div>

            {period === "custom" && (
              <>
                <label className="space-y-2 text-sm font-bold text-gray-700">
                  <span className="block">Data inicial</span>
                  <AdminInput
                    className="admin-filter-control"
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm font-bold text-gray-700">
                  <span className="block">Data final</span>
                  <AdminInput
                    className="admin-filter-control"
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: "Pedidos", value: String(summary.count), icon: <ClipboardList key="orders" size={18} />, tone: "bg-orange-50 text-[var(--brand)]" },
            { label: "Vendas", value: formatMoney(summary.value), icon: <WalletCards key="sales" size={18} />, tone: "bg-emerald-50 text-emerald-600" },
            { label: "Ticket médio", value: formatMoney(summary.average), icon: <ReceiptText key="ticket" size={18} />, tone: "bg-blue-50 text-blue-600" },
            { label: "Cancelados", value: String(summary.canceled), icon: <CircleX key="canceled" size={18} />, tone: "bg-red-50 text-red-600" },
          ].map((metric) => (
            <div key={metric.label} className="surface-card flex min-h-[78px] items-center gap-2.5 rounded-2xl px-3 py-3 sm:min-h-[84px] sm:gap-3 sm:px-4">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${metric.tone}`}>
                {metric.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px] sm:tracking-[0.1em]">{metric.label}</p>
                <p className="mt-1 truncate text-base font-black text-gray-950 sm:text-lg">{metric.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-gray-500">
            {visibleOrders.length} {visibleOrders.length === 1 ? "pedido encontrado" : "pedidos encontrados"}
          </p>
          <AdminButton variant="secondary" onClick={toggleAllGroups} disabled={!groupedOrders.length}>
            <ChevronsUpDown size={16} />
            {allCurrentGroupsCollapsed ? "Expandir datas" : "Recolher datas"}
          </AdminButton>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
          <div className="admin-table-header hidden grid-cols-[84px_96px_minmax(220px,1.25fr)_minmax(132px,0.75fr)_minmax(128px,0.75fr)_112px_32px] items-center gap-3 border-b border-[var(--line)] bg-[#fffdfa] px-5 py-3 xl:grid">
            <SortableTableHeader label="Horário" active={sortKey === "created_at"} direction={sortKey === "created_at" ? sortDirection : null} onClick={() => toggleSort("created_at")} />
            <SortableTableHeader label="Pedido" active={sortKey === "id"} direction={sortKey === "id" ? sortDirection : null} onClick={() => toggleSort("id")} />
            <SortableTableHeader label="Cliente" active={sortKey === "customer_name"} direction={sortKey === "customer_name" ? sortDirection : null} onClick={() => toggleSort("customer_name")} />
            <SortableTableHeader label="Situação" active={sortKey === "status"} direction={sortKey === "status" ? sortDirection : null} onClick={() => toggleSort("status")} />
            <SortableTableHeader label="Pagamento" active={sortKey === "payment_method"} direction={sortKey === "payment_method" ? sortDirection : null} onClick={() => toggleSort("payment_method")} />
            <SortableTableHeader label="Valor" active={sortKey === "total"} direction={sortKey === "total" ? sortDirection : null} onClick={() => toggleSort("total")} className="justify-end" />
            <span className="sr-only">Detalhes</span>
          </div>

          {paginatedOrders.length === 0 ? (
            <AdminEmptyState
              icon={<History size={22} />}
              title="Nenhum pedido encontrado"
              description="Ajuste a busca, os filtros ou o período selecionado."
              action={<AdminButton variant="filter" onClick={clearFilters}>Limpar filtros</AdminButton>}
            />
          ) : (
            groupedOrders.map((group) => {
              const isCollapsed = collapsedDates.includes(group.key);

              return (
                <section key={group.key} className="border-b border-[var(--line)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleDateGroup(group.key)}
                    aria-expanded={!isCollapsed}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-[#fcfaf7] px-4 py-3 text-left transition-colors hover:bg-orange-50/60 sm:px-5 xl:grid-cols-[84px_96px_minmax(220px,1.25fr)_minmax(132px,0.75fr)_minmax(128px,0.75fr)_112px_32px]"
                  >
                    <div className="min-w-0 xl:col-span-5">
                      <p className="truncate text-sm font-black text-gray-950">{group.label}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {group.orders.length} {group.orders.length === 1 ? "pedido" : "pedidos"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-600 xl:text-right">{formatMoney(group.total)}</span>
                    <ChevronDown size={18} className={`justify-self-end text-gray-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  {!isCollapsed && (
                    <div className="divide-y divide-[var(--line)]">
                      {group.orders.map((order) => {
                        const orderItems = getOrderItems(order);
                        const firstItem = orderItems[0];
                        const totalItemQuantity = orderItems.reduce(
                          (sum, item) => sum + Number(item.quantity || 1),
                          0,
                        );

                        return (
                          <details key={order.id} className="group bg-white">
                            <summary className="list-none cursor-pointer px-4 py-4 transition-colors hover:bg-[#fffdfa] sm:px-5 [&::-webkit-details-marker]:hidden">
                              <div className="flex items-start justify-between gap-3 xl:grid xl:grid-cols-[84px_96px_minmax(220px,1.25fr)_minmax(132px,0.75fr)_minmax(128px,0.75fr)_112px_32px] xl:items-center xl:gap-3">
                                <div className="hidden text-sm font-bold text-gray-700 xl:block">{formatHour(order.created_at)}</div>
                                <div className="min-w-0">
                                  <p className="font-black text-gray-950">#{getOrderNumber(order)}</p>
                                  <p className="mt-1 text-xs font-semibold text-gray-400 xl:hidden">
                                    {formatHour(order.created_at)} · {formatDate(order.created_at)}
                                  </p>
                                </div>
                                <div className="hidden min-w-0 xl:block">
                                  <p className="truncate text-sm font-semibold text-gray-950">{order.customer_name}</p>
                                  <p className="mt-1 truncate text-xs text-gray-400">
                                    {firstItem ? `${Number(firstItem.quantity || 1)}x ${getItemName(firstItem)}` : "Itens não informados"}
                                    {orderItems.length > 1 ? ` +${orderItems.length - 1}` : ""}
                                  </p>
                                </div>
                                <div className="hidden xl:block">
                                  <OrderStatusBadge status={order.status} className="whitespace-nowrap" />
                                </div>
                                <p className="hidden truncate text-sm font-semibold text-gray-600 xl:block">{formatPaymentMethod(order.payment_method)}</p>
                                <p className="hidden text-right text-sm font-black text-gray-950 xl:block">{formatMoney(Number(order.total || 0))}</p>
                                <ChevronDown size={18} className="hidden justify-self-end text-gray-400 transition-transform group-open:rotate-180 xl:block" />

                                <div className="min-w-0 flex-1 xl:hidden">
                                  <p className="truncate text-sm font-semibold text-gray-700">{order.customer_name}</p>
                                  <p className="mt-1 truncate text-xs text-gray-400">
                                    {firstItem ? `${Number(firstItem.quantity || 1)}x ${getItemName(firstItem)}` : "Itens não informados"}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <OrderStatusBadge status={order.status} className="whitespace-nowrap" />
                                    <span className="text-xs font-semibold text-gray-400">{formatPaymentMethod(order.payment_method)}</span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2 xl:hidden">
                                  <p className="text-sm font-black text-gray-950">{formatMoney(Number(order.total || 0))}</p>
                                  <ChevronDown size={17} className="text-gray-400 transition-transform group-open:rotate-180" />
                                </div>
                              </div>
                            </summary>

                            <div className="border-t border-[var(--line)] bg-[#fcfaf7] px-4 py-4 sm:px-5">
                              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)]">
                                <section className="rounded-2xl border border-[var(--line)] bg-white p-4" aria-label={`Produtos do pedido ${getOrderNumber(order)}`}>
                                  <div className="flex items-center gap-2">
                                    <Package size={17} className="text-[var(--brand)]" />
                                    <h3 className="text-sm font-black text-gray-950">Itens do pedido</h3>
                                    <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand)]">
                                      {totalItemQuantity} {totalItemQuantity === 1 ? "item" : "itens"}
                                    </span>
                                  </div>

                                  {orderItems.length === 0 ? (
                                    <p className="mt-4 text-sm text-gray-500">Os produtos deste pedido não foram informados.</p>
                                  ) : (
                                    <div className="mt-3 divide-y divide-[var(--line)]">
                                      {orderItems.map((item, index) => {
                                        const quantity = Number(item.quantity || 1);
                                        const addons = getItemAddons(item);

                                        return (
                                          <div key={`${order.id}-${getItemName(item)}-${index}`} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                                            <span className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff3e8] px-2 text-xs font-black text-[var(--brand)]">{quantity}x</span>
                                            <div className="min-w-0 flex-1">
                                              <p className="font-bold text-gray-800">{getItemName(item)}</p>
                                              {addons.length > 0 && <p className="mt-1 text-xs leading-relaxed text-gray-500">Adicionais: {addons.join(", ")}</p>}
                                              {item.observation && <p className="mt-1 text-xs leading-relaxed text-gray-500">Observação: {item.observation}</p>}
                                            </div>
                                            {Number(item.price || 0) > 0 && (
                                              <p className="shrink-0 text-sm font-bold text-gray-700">{formatMoney(Number(item.price || 0) * quantity)}</p>
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
                                      ["Telefone", formatPhone(order.customer_phone)],
                                      ["Pagamento", formatPaymentMethod(order.payment_method)],
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
                                <AdminButton variant="secondary" onClick={() => void handleCopyOrder(order.id)}>
                                  <Copy size={15} />
                                  Copiar ID
                                </AdminButton>
                                <AdminButton
                                  variant="secondary"
                                  onClick={() => window.open(`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer")}
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                >
                                  <MessageCircle size={15} />
                                  WhatsApp
                                </AdminButton>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {visibleOrders.length > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>Página {page} de {totalPages}</p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  <ChevronLeft size={16} />
                  Anterior
                </AdminButton>
                <AdminButton variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                  Próxima
                  <ChevronRight size={16} />
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminPageShell>
  );
}
