"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bike,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  MoreVertical,
  PackageCheck,
  ShoppingBag,
  Store,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, AdminPageShell, AdminSelect, AdminSkeleton } from "@/components/ui/admin-primitives";
import { LiveStatusDot } from "@/components/ui/live-status-dot";
import { isWithinPeriod, type PeriodKey } from "@/lib/admin-period";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { getStoreStatus } from "@/features/storefront/store-summary";

type OrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";
type DashboardPeriod = Extract<PeriodKey, "7d" | "30d" | "year">;
type SourceKey = "ifood" | "whatsapp" | "storefront" | "counter" | "other";

type OrderRow = {
  id: string;
  customer_name: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  display_number?: number | null;
  external_source?: string | null;
  address?: {
    fulfillment_type?: "delivery" | "pickup" | null;
  } | null;
  order_items: Array<{
    product_name?: string | null;
    quantity?: number | null;
  }>;
};

type MetricCard = {
  id: "revenue" | "orders" | "ticket" | "completed" | "canceled";
  label: string;
  value: string;
  change: number;
  positiveIsGood: boolean;
  icon: LucideIcon;
  iconClass: string;
};

type RevenuePoint = {
  key: string;
  label: string;
  revenue: number;
};

type SourcePoint = {
  key: SourceKey;
  label: string;
  count: number;
  color: string;
};

const STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "border-orange-200 bg-orange-50 text-orange-700" },
  preparing: { label: "Em preparo", className: "border-amber-200 bg-amber-50 text-amber-700" },
  delivering: { label: "Em rota", className: "border-blue-200 bg-blue-50 text-blue-700" },
  done: { label: "Concluído", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  canceled: { label: "Cancelado", className: "border-red-200 bg-red-50 text-red-700" },
};

const SOURCE_META: Record<SourceKey, { label: string; color: string }> = {
  ifood: { label: "iFood", color: "#ff6a00" },
  whatsapp: { label: "WhatsApp", color: "#f5a623" },
  storefront: { label: "Site próprio", color: "#35c2c0" },
  counter: { label: "Balcão", color: "#6b9ff8" },
  other: { label: "Outros", color: "#c8d7df" },
};

const DASHBOARD_PERIODS: Array<{ id: DashboardPeriod; label: string }> = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "year", label: "Este ano" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCompactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} mil`;
  return `R$ ${Math.round(value)}`;
}

function formatHour(date: string) {
  return new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateKey(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function resolveSource(order: OrderRow): SourceKey {
  const source = String(order.external_source || "").toLowerCase();
  if (source.includes("ifood")) return "ifood";
  if (source.includes("whatsapp")) return "whatsapp";
  if (order.address?.fulfillment_type === "pickup") return "counter";
  if (source.includes("site") || source.includes("store") || source.includes("web")) return "storefront";
  if (!source) return "storefront";
  return "other";
}

function buildRevenueSeries(orders: OrderRow[], period: DashboardPeriod): RevenuePoint[] {
  const now = new Date();

  if (period === "year") {
    return Array.from({ length: 12 }, (_, month) => {
      const date = new Date(now.getFullYear(), month, 1);
      const revenue = orders
        .filter((order) => {
          const orderDate = new Date(order.created_at);
          return orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === month;
        })
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

      return {
        key: `${now.getFullYear()}-${month}`,
        label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        revenue,
      };
    });
  }

  const days = period === "30d" ? 30 : 7;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (days - 1 - index));
    date.setHours(0, 0, 0, 0);
    const key = toDateKey(date);
    const revenue = orders
      .filter((order) => toDateKey(order.created_at) === key)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      key,
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""),
      revenue,
    };
  });
}

function DashboardSkeleton() {
  return (
    <AdminPageShell className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <AdminSkeleton className="h-8 w-44" />
          <AdminSkeleton className="h-4 w-80 max-w-full" />
        </div>
        <AdminSkeleton className="h-20 w-full lg:w-[420px]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <AdminSkeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <AdminSkeleton className="h-[340px] xl:col-span-5" />
        <AdminSkeleton className="h-[340px] xl:col-span-3" />
        <AdminSkeleton className="h-[340px] xl:col-span-4" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <AdminSkeleton className="h-[330px] xl:col-span-5" />
        <AdminSkeleton className="h-[330px] xl:col-span-7" />
      </div>
    </AdminPageShell>
  );
}

function MetricCardView({ card }: { card: MetricCard }) {
  const Icon = card.icon;
  const isUp = card.change >= 0;
  const isGood = card.change === 0 || (card.positiveIsGood ? isUp : !isUp);
  const TrendIcon = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="surface-card rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-500">{card.label}</p>
          <p className="mt-3 truncate text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">{card.value}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}>
          <Icon size={21} />
        </div>
      </div>
      <div className={`mt-4 inline-flex items-center gap-1 text-xs font-bold ${isGood ? "text-emerald-600" : "text-red-600"}`}>
        <TrendIcon size={14} />
        {Math.abs(card.change).toFixed(1)}%
        <span className="font-medium text-gray-400">vs. ontem</span>
      </div>
    </article>
  );
}

export default function AdminHomePage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantName, setRestaurantName] = useState("sua loja");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [workHours, setWorkHours] = useState<unknown>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("7d");

  useEffect(() => {
    void fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const { restaurant } = await getCurrentRestaurant(supabase);
      if (!restaurant) {
        router.replace("/admin/setup");
        return;
      }

      setRestaurantName(restaurant.name || "sua loja");
      setRestaurantSlug(restaurant.slug || "");
      setWorkHours(restaurant.work_hours || []);

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, customer_name, total, status, created_at, display_number, external_source, address, order_items (product_name, quantity)",
        )
        .eq("restaurant_id", restaurant.id)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setOrders((data || []) as OrderRow[]);
    } catch (error) {
      console.error(error);
      setErrorMsg("Erro ao carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const storeStatus = useMemo(() => getStoreStatus(workHours), [workHours]);

  const dashboard = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const todayKey = toDateKey(now);
    const yesterdayKey = toDateKey(yesterday);
    const todayOrders = orders.filter((order) => toDateKey(order.created_at) === todayKey);
    const yesterdayOrders = orders.filter((order) => toDateKey(order.created_at) === yesterdayKey);

    const summarize = (rows: OrderRow[]) => {
      const valid = rows.filter((order) => order.status !== "canceled");
      const revenue = valid.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return {
        count: rows.length,
        revenue,
        ticket: valid.length > 0 ? revenue / valid.length : 0,
        completed: rows.filter((order) => order.status === "done").length,
        canceled: rows.filter((order) => order.status === "canceled").length,
      };
    };

    const today = summarize(todayOrders);
    const previous = summarize(yesterdayOrders);

    const metrics: MetricCard[] = [
      {
        id: "revenue",
        label: "Faturamento (hoje)",
        value: formatMoney(today.revenue),
        change: percentageChange(today.revenue, previous.revenue),
        positiveIsGood: true,
        icon: CircleDollarSign,
        iconClass: "bg-orange-100 text-[var(--brand)]",
      },
      {
        id: "orders",
        label: "Pedidos (hoje)",
        value: String(today.count),
        change: percentageChange(today.count, previous.count),
        positiveIsGood: true,
        icon: ShoppingBag,
        iconClass: "bg-[#fff0e8] text-[var(--brand)]",
      },
      {
        id: "ticket",
        label: "Ticket médio",
        value: formatMoney(today.ticket),
        change: percentageChange(today.ticket, previous.ticket),
        positiveIsGood: true,
        icon: BarChart3,
        iconClass: "bg-amber-100 text-amber-600",
      },
      {
        id: "completed",
        label: "Pedidos concluídos",
        value: String(today.completed),
        change: percentageChange(today.completed, previous.completed),
        positiveIsGood: true,
        icon: CheckCircle2,
        iconClass: "bg-emerald-100 text-emerald-600",
      },
      {
        id: "canceled",
        label: "Pedidos cancelados",
        value: String(today.canceled),
        change: percentageChange(today.canceled, previous.canceled),
        positiveIsGood: false,
        icon: XCircle,
        iconClass: "bg-red-100 text-red-600",
      },
    ];

    const periodOrders = orders.filter((order) => isWithinPeriod(order.created_at, period));
    const validPeriodOrders = periodOrders.filter((order) => order.status !== "canceled");
    const periodRevenue = validPeriodOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const revenueSeries = buildRevenueSeries(validPeriodOrders, period);

    const productMap = new Map<string, number>();
    validPeriodOrders.forEach((order) => {
      order.order_items?.forEach((item) => {
        const name = item.product_name?.trim();
        if (!name) return;
        productMap.set(name, (productMap.get(name) || 0) + Number(item.quantity || 0));
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const sourceCounts = new Map<SourceKey, number>();
    validPeriodOrders.forEach((order) => {
      const source = resolveSource(order);
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    });

    const sources: SourcePoint[] = (Object.keys(SOURCE_META) as SourceKey[])
      .map((key) => ({ key, ...SOURCE_META[key], count: sourceCounts.get(key) || 0 }))
      .filter((source) => source.count > 0);

    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}h`,
      orders: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).length,
    }));

    const peakHour = hourlyActivity.reduce(
      (peak, point) => (point.orders > peak.orders ? point : peak),
      hourlyActivity[0] || { hour: 0, label: "00h", orders: 0 },
    );

    return {
      metrics,
      periodOrders,
      periodRevenue,
      revenueSeries,
      topProducts,
      sources,
      sourceTotal: sources.reduce((sum, source) => sum + source.count, 0),
      hourlyActivity,
      peakHour,
      inKitchen: todayOrders.filter((order) => order.status === "preparing").length,
      onTheWay: todayOrders.filter((order) => order.status === "delivering").length,
      recentOrders: orders.slice(0, 5),
    };
  }, [orders, period]);

  if (loading) return <DashboardSkeleton />;

  if (errorMsg) {
    return (
      <AdminPageShell>
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
          {errorMsg}
        </div>
      </AdminPageShell>
    );
  }

  const storeTone = {
    open: {
      shell: "border-emerald-100 bg-white",
      icon: "bg-emerald-500 text-white",
      title: "text-emerald-700",
      dot: "text-emerald-500",
      label: "Loja aberta",
      helper: "Recebendo pedidos",
    },
    closing: {
      shell: "border-amber-200 bg-amber-50",
      icon: "bg-amber-500 text-white",
      title: "text-amber-700",
      dot: "text-amber-500",
      label: "Fechando em breve",
      helper: "Confira os pedidos pendentes",
    },
    closed: {
      shell: "border-red-200 bg-red-50",
      icon: "bg-red-500 text-white",
      title: "text-red-700",
      dot: "text-red-500",
      label: "Loja fechada",
      helper: "Fora do horário de atendimento",
    },
  }[storeStatus.tone];

  return (
    <AdminPageShell className="space-y-5 sm:space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description={`Resumo da operação da ${restaurantName} em tempo real.`}
        action={
          <div className={`flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 shadow-sm sm:w-auto ${storeTone.shell}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${storeTone.icon}`}>
              <Store size={20} />
            </div>
            <div className="min-w-0 flex-1 sm:min-w-[150px]">
              <p className={`font-black ${storeTone.title}`}>{storeTone.label}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span>{storeTone.helper}</span>
                <LiveStatusDot className={storeTone.dot} />
              </div>
            </div>
            <Link
              href={restaurantSlug ? `/${restaurantSlug}` : "/admin/settings"}
              target={restaurantSlug ? "_blank" : undefined}
              className="hidden min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-bold text-gray-700 transition-colors hover:text-gray-950 sm:inline-flex"
            >
              Ver loja <ExternalLink size={14} />
            </Link>
            <Link
              href="/admin/settings"
              aria-label="Abrir configurações da loja"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-500 transition-colors hover:text-gray-950"
            >
              <MoreVertical size={17} />
            </Link>
          </div>
        }
      />

      <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-2 text-xs font-bold text-[var(--brand)]">
        <LiveStatusDot className="text-current" />
        Dashboard em tempo real
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {dashboard.metrics.map((card) => (
          <MetricCardView key={card.id} card={card} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-black text-gray-950">Faturamento</p>
              <p className="mt-1 text-xs text-gray-400">Evolução das vendas no período</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-lg font-black text-gray-950">{formatMoney(dashboard.periodRevenue)}</p>
                <p className="text-xs font-semibold text-emerald-600">Receita não cancelada</p>
              </div>
              <AdminSelect
                value={period}
                onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
                className="min-h-10 w-[148px] py-2 text-xs"
                aria-label="Período do dashboard"
              >
                {DASHBOARD_PERIODS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
          </div>

          <div className="mt-5 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.revenueSeries} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6a00" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#ff6a00" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#efe7df" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8c837c" }} minTickGap={20} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8c837c" }} tickFormatter={(value) => formatCompactMoney(Number(value))} />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value))}
                  contentStyle={{ borderRadius: 14, borderColor: "#eee3d9", boxShadow: "0 12px 30px rgba(63, 43, 29, 0.08)" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Faturamento"
                  stroke="#ff6a00"
                  strokeWidth={3}
                  fill="url(#dashboardRevenue)"
                  activeDot={{ r: 5, fill: "#ff6a00", stroke: "#ffffff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-gray-950">Produtos mais pedidos</p>
              <p className="mt-1 text-xs text-gray-400">Ranking por quantidade</p>
            </div>
            <span className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-500">
              {DASHBOARD_PERIODS.find((option) => option.id === period)?.label}
            </span>
          </div>

          {dashboard.topProducts.length === 0 ? (
            <div className="mt-5 flex h-[250px] items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 text-center text-sm text-gray-500">
              Nenhum produto vendido no período.
            </div>
          ) : (
            <div className="mt-5 h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.topProducts} layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    width={118}
                    tick={{ fontSize: 10, fill: "#554c46" }}
                  />
                  <Tooltip formatter={(value) => `${Number(value)} unidade(s)`} />
                  <Bar dataKey="quantity" name="Quantidade" fill="#ff6a00" radius={[0, 8, 8, 0]} barSize={11} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-4">
          <p className="text-base font-black text-gray-950">Fontes de pedidos</p>
          <p className="mt-1 text-xs text-gray-400">Origem dos pedidos válidos no período</p>

          {dashboard.sources.length === 0 ? (
            <div className="mt-5 flex h-[250px] items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 text-center text-sm text-gray-500">
              Nenhum pedido registrado no período.
            </div>
          ) : (
            <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_150px]">
              <div className="relative h-[250px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(value) => `${Number(value)} pedido(s)`} />
                    <Pie
                      data={dashboard.sources}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={1}
                    >
                      {dashboard.sources.map((source) => (
                        <Cell key={source.key} fill={source.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-black text-gray-950">{dashboard.sourceTotal}</p>
                  <p className="text-xs text-gray-400">pedidos</p>
                </div>
              </div>
              <div className="space-y-3">
                {dashboard.sources.map((source) => {
                  const percentage = dashboard.sourceTotal > 0 ? (source.count / dashboard.sourceTotal) * 100 : 0;
                  return (
                    <div key={source.key} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: source.color }} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-gray-600">{source.label}</span>
                      <span className="shrink-0 font-bold text-gray-950">
                        {source.count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-black text-gray-950">Atividade diária</p>
              <p className="mt-1 text-xs text-gray-400">Pedidos distribuídos ao longo de hoje</p>
            </div>
            <span className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-500">Hoje</span>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_155px]">
            <div className="h-[245px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.hourlyActivity} margin={{ top: 12, right: 4, left: -26, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#efe7df" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={3} tick={{ fontSize: 10, fill: "#8c837c" }} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#8c837c" }} />
                  <Tooltip formatter={(value) => `${Number(value)} pedido(s)`} />
                  <Bar dataKey="orders" name="Pedidos" fill="#ff6a00" radius={[6, 6, 0, 0]} barSize={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid content-center gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl bg-[#fff7f1] p-4">
                <Clock3 size={17} className="text-[var(--brand)]" />
                <p className="mt-3 text-xs font-bold text-gray-400">Pico de pedidos</p>
                <p className="mt-1 text-lg font-black text-gray-950">
                  {dashboard.peakHour.label} – {String((dashboard.peakHour.hour + 1) % 24).padStart(2, "0")}h
                </p>
                <p className="mt-1 text-xs text-gray-500">{dashboard.peakHour.orders} pedido(s)</p>
              </div>
              <div className="rounded-2xl bg-[#fff7f1] p-4">
                <PackageCheck size={17} className="text-[var(--brand)]" />
                <p className="mt-3 text-xs font-bold text-gray-400">Em preparo agora</p>
                <p className="mt-1 text-lg font-black text-gray-950">{dashboard.inKitchen}</p>
              </div>
              <div className="rounded-2xl bg-[#fff7f1] p-4">
                <Bike size={17} className="text-[var(--brand)]" />
                <p className="mt-3 text-xs font-bold text-gray-400">Em rota agora</p>
                <p className="mt-1 text-lg font-black text-gray-950">{dashboard.onTheWay}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="surface-card overflow-hidden rounded-[24px] xl:col-span-7">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div>
              <p className="text-base font-black text-gray-950">Pedidos recentes</p>
              <p className="mt-1 text-xs text-gray-400">Últimas movimentações da operação</p>
            </div>
            <Link href="/admin/orders" className="text-xs font-black text-[var(--brand)] hover:underline">
              Ver todos
            </Link>
          </div>

          {dashboard.recentOrders.length === 0 ? (
            <div className="flex min-h-[270px] items-center justify-center px-6 text-center text-sm text-gray-500">
              Nenhum pedido registrado ainda.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">
                      <th className="px-5 py-3">Pedido</th>
                      <th className="px-3 py-3">Cliente</th>
                      <th className="px-3 py-3">Origem</th>
                      <th className="px-3 py-3">Horário</th>
                      <th className="px-3 py-3">Valor</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="w-10 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {dashboard.recentOrders.map((order) => {
                      const source = SOURCE_META[resolveSource(order)];
                      const status = STATUS_META[order.status];
                      return (
                        <tr key={order.id} className="text-gray-600 transition-colors hover:bg-[#fffaf6]">
                          <td className="px-5 py-3.5 font-black text-gray-950">
                            #{order.display_number || order.id.slice(0, 5)}
                          </td>
                          <td className="max-w-[150px] truncate px-3 py-3.5 font-semibold text-gray-700">{order.customer_name}</td>
                          <td className="px-3 py-3.5">
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />
                              {source.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5">{formatDateTime(order.created_at)}</td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-bold text-gray-950">{formatMoney(order.total)}</td>
                          <td className="px-3 py-3.5">
                            <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-gray-400">
                            <MoreVertical size={16} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-[var(--line)] md:hidden">
                {dashboard.recentOrders.map((order) => {
                  const source = SOURCE_META[resolveSource(order)];
                  const status = STATUS_META[order.status];
                  return (
                    <div key={order.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-gray-950">#{order.display_number || order.id.slice(0, 5)}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-gray-600">{order.customer_name}</p>
                        </div>
                        <p className="shrink-0 font-black text-gray-950">{formatMoney(order.total)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#f8f3ec] px-3 py-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />
                          {source.label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f8f3ec] px-3 py-1.5">
                          <Clock3 size={13} /> {formatHour(order.created_at)}
                        </span>
                        <span className={`inline-flex rounded-full border px-3 py-1.5 font-bold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </article>
      </section>
    </AdminPageShell>
  );
}
