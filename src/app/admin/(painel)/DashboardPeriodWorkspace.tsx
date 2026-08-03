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
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSelect,
} from "@/components/ui/admin-primitives";
import { LiveStatusDot } from "@/components/ui/live-status-dot";
import { AdminDatePicker } from "@/components/ui/admin-date-picker";
import { AdminEmptyState, AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { getStoreStatus } from "@/features/storefront/store-summary";

type OrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";
type DashboardPeriod = "today" | "7d" | "30d" | "year" | "all" | "custom";
type SourceKey = "ifood" | "whatsapp" | "storefront" | "counter" | "other";

type OrderRow = {
  id: string;
  customer_name: string;
  total: number;
  status: OrderStatus;
  created_at: string;
  display_number?: number | null;
  external_source?: string | null;
  address?: { fulfillment_type?: "delivery" | "pickup" | null } | null;
  order_items: Array<{ product_name?: string | null; quantity?: number | null }>;
};

type MetricCard = {
  id: "revenue" | "orders" | "ticket" | "completed" | "canceled";
  label: string;
  value: string;
  change: number | null;
  comparisonLabel: string;
  positiveIsGood: boolean;
  icon: LucideIcon;
  iconClass: string;
};

type PeriodRange = {
  label: string;
  shortLabel: string;
  comparisonLabel: string;
  start: Date | null;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
};

type RevenuePoint = { key: string; label: string; revenue: number };
type SourcePoint = { key: SourceKey; label: string; count: number; color: string };
type TopProductPoint = { name: string; shortName: string; quantity: number };

const DAY_IN_MS = 86_400_000;
const TOP_PRODUCT_LABEL_MAX_LENGTH = 18;

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
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "year", label: "Este ano" },
  { id: "all", label: "Todo o período" },
  { id: "custom", label: "Período personalizado" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatCompactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} mil`;
  return `R$ ${Math.round(value)}`;
}

function formatHour(date: string) {
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeProductName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function abbreviateProductName(name: string, maxLength = TOP_PRODUCT_LABEL_MAX_LENGTH) {
  const normalized = normalizeProductName(name);
  if (normalized.length <= maxLength) return normalized;

  const availableLength = Math.max(4, maxLength - 1);
  const candidate = normalized.slice(0, availableLength);
  const lastSpace = candidate.lastIndexOf(" ");
  const cutAt = lastSpace >= Math.floor(availableLength * 0.55) ? lastSpace : availableLength;

  return `${normalized.slice(0, cutAt).trimEnd()}…`;
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function toDateKey(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function toMonthKey(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function toInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseInputDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function formatRangeDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getPeriodRange(
  period: DashboardPeriod,
  customStart: string,
  customEnd: string,
  now = new Date(),
): PeriodRange {
  if (period === "today") {
    return {
      label: "Hoje",
      shortLabel: "hoje",
      comparisonLabel: "vs. ontem",
      start: startOfDay(now),
      end: now,
      previousStart: startOfDay(addDays(now, -1)),
      previousEnd: endOfDay(addDays(now, -1)),
    };
  }

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const start = startOfDay(addDays(now, -(days - 1)));
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = startOfDay(addDays(start, -days));
    return {
      label: period === "7d" ? "Últimos 7 dias" : "Últimos 30 dias",
      shortLabel: period === "7d" ? "7 dias" : "30 dias",
      comparisonLabel: period === "7d" ? "vs. 7 dias anteriores" : "vs. 30 dias anteriores",
      start,
      end: now,
      previousStart,
      previousEnd,
    };
  }

  if (period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const previousStart = new Date(now.getFullYear() - 1, 0, 1);
    const previousEnd = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
    return {
      label: "Este ano",
      shortLabel: "ano",
      comparisonLabel: "vs. ano anterior",
      start,
      end: now,
      previousStart,
      previousEnd,
    };
  }

  if (period === "custom") {
    const fallbackEnd = endOfDay(now);
    const fallbackStart = startOfDay(addDays(now, -6));
    const parsedStart = parseInputDate(customStart);
    const parsedEnd = parseInputDate(customEnd);
    const start = startOfDay(parsedStart || fallbackStart);
    const end = endOfDay(parsedEnd || fallbackEnd);
    const normalizedStart = start <= end ? start : startOfDay(end);
    const normalizedEnd = start <= end ? end : endOfDay(start);
    const days = Math.max(
      1,
      Math.round((startOfDay(normalizedEnd).getTime() - normalizedStart.getTime()) / DAY_IN_MS) + 1,
    );
    const previousEnd = new Date(normalizedStart.getTime() - 1);
    const previousStart = startOfDay(addDays(normalizedStart, -days));
    return {
      label: `${formatRangeDate(normalizedStart)} a ${formatRangeDate(normalizedEnd)}`,
      shortLabel: "período",
      comparisonLabel: "vs. período anterior",
      start: normalizedStart,
      end: normalizedEnd,
      previousStart,
      previousEnd,
    };
  }

  return {
    label: "Todo o período",
    shortLabel: "total",
    comparisonLabel: "período completo",
    start: null,
    end: now,
    previousStart: null,
    previousEnd: null,
  };
}

function isInRange(order: OrderRow, start: Date | null, end: Date | null) {
  const value = new Date(order.created_at).getTime();
  if (start && value < start.getTime()) return false;
  if (end && value > end.getTime()) return false;
  return true;
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

function buildDailyRevenueSeries(orders: OrderRow[], start: Date, end: Date): RevenuePoint[] {
  const days = Math.max(
    1,
    Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_IN_MS) + 1,
  );

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startOfDay(start), index);
    const key = toDateKey(date);
    return {
      key,
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", ""),
      revenue: orders
        .filter((order) => toDateKey(order.created_at) === key)
        .reduce((sum, order) => sum + Number(order.total || 0), 0),
    };
  });
}

function buildMonthlyRevenueSeries(orders: OrderRow[], start: Date, end: Date): RevenuePoint[] {
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const points: RevenuePoint[] = [];

  while (cursor <= last) {
    const key = toMonthKey(cursor);
    points.push({
      key,
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
      revenue: orders
        .filter((order) => toMonthKey(order.created_at) === key)
        .reduce((sum, order) => sum + Number(order.total || 0), 0),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}

function buildRevenueSeries(orders: OrderRow[], period: DashboardPeriod, range: PeriodRange): RevenuePoint[] {
  if (period === "today") {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: `${String(hour).padStart(2, "0")}h`,
      revenue: orders
        .filter((order) => new Date(order.created_at).getHours() === hour)
        .reduce((sum, order) => sum + Number(order.total || 0), 0),
    }));
  }

  if (period === "7d" || period === "30d") {
    return buildDailyRevenueSeries(orders, range.start || new Date(), range.end);
  }

  if (period === "year") {
    return Array.from({ length: 12 }, (_, month) => {
      const date = new Date(range.end.getFullYear(), month, 1);
      const key = toMonthKey(date);
      return {
        key,
        label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        revenue: orders
          .filter((order) => toMonthKey(order.created_at) === key)
          .reduce((sum, order) => sum + Number(order.total || 0), 0),
      };
    });
  }

  if (period === "custom" && range.start) {
    const days = Math.max(
      1,
      Math.round((startOfDay(range.end).getTime() - range.start.getTime()) / DAY_IN_MS) + 1,
    );
    return days <= 45
      ? buildDailyRevenueSeries(orders, range.start, range.end)
      : buildMonthlyRevenueSeries(orders, range.start, range.end);
  }

  const dates = orders.map((order) => new Date(order.created_at)).filter((date) => Number.isFinite(date.getTime()));
  if (dates.length === 0) return [];
  const first = new Date(Math.min(...dates.map((date) => date.getTime())));
  return buildMonthlyRevenueSeries(orders, first, range.end);
}

function DashboardSkeleton() {
  return <AdminPageSkeleton ariaLabel="Carregando dashboard" metrics={5} />;
}

function MetricCardView({ card }: { card: MetricCard }) {
  const Icon = card.icon;
  const isFeatured = card.id === "revenue";
  const isUp = (card.change || 0) >= 0;
  const isGood = card.change === null || card.change === 0 || (card.positiveIsGood ? isUp : !isUp);
  const TrendIcon = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <article className={`dashboard-metric-card surface-card p-5 ${isFeatured ? "dashboard-metric-card--featured" : ""}`}>
      <div className="dashboard-metric-card-header flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`dashboard-metric-card-label text-sm font-semibold ${isFeatured ? "text-orange-50" : "text-gray-500"}`}>{card.label}</p>
          <p className={`mt-3 truncate text-2xl font-black tracking-tight sm:text-3xl ${isFeatured ? "text-white" : "text-gray-950"}`}>{card.value}</p>
        </div>
        <div className={`dashboard-metric-card-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isFeatured ? "bg-white/20 text-white" : card.iconClass}`}>
          <Icon size={21} />
        </div>
      </div>
      {card.change === null ? (
        <p className={`mt-4 text-xs font-semibold ${isFeatured ? "text-orange-100" : "text-gray-400"}`}>{card.comparisonLabel}</p>
      ) : (
        <div className={`mt-4 inline-flex items-center gap-1 text-xs font-bold ${isFeatured ? "text-white" : isGood ? "text-emerald-600" : "text-red-600"}`}>
          <TrendIcon size={14} />
          {Math.abs(card.change).toFixed(1)}%
          <span className={`font-medium ${isFeatured ? "text-orange-100" : "text-gray-400"}`}>{card.comparisonLabel}</span>
        </div>
      )}
    </article>
  );
}

export default function DashboardPeriodWorkspace() {
  const router = useRouter();
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [restaurantName, setRestaurantName] = useState("sua loja");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [workHours, setWorkHours] = useState<unknown>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [dashboardClock, setDashboardClock] = useState(() => new Date());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [customStart, setCustomStart] = useState(() => toInputDate(addDays(new Date(), -6)));
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));

  useEffect(() => {
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
        setRestaurantId(restaurant.id);

        const { data, error } = await supabase
          .from("orders")
          .select("id, customer_name, total, status, created_at, display_number, external_source, address, order_items (product_name, quantity)")
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

    void fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    let isRefreshing = false;
    let isMounted = true;

    const refreshOrders = async () => {
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, customer_name, total, status, created_at, display_number, external_source, address, order_items (product_name, quantity)")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (isMounted) setOrders((data || []) as OrderRow[]);
      } catch (error) {
        console.warn("Falha ao atualizar o dashboard em tempo real:", error);
      } finally {
        isRefreshing = false;
      }
    };

    const ordersChannel = supabase
      .channel(`dashboard-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => void refreshOrders(),
      )
      .subscribe();

    const itemsChannel = supabase
      .channel(`dashboard-order-items-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void refreshOrders(),
      )
      .subscribe();

    const intervalId = window.setInterval(() => void refreshOrders(), 15_000);
    const handleFocus = () => void refreshOrders();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(itemsChannel);
    };
  }, [restaurantId, supabase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setDashboardClock(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const storeStatus = useMemo(
    () => getStoreStatus(workHours, dashboardClock),
    [dashboardClock, workHours],
  );
  const dashboard = useMemo(() => {
    const range = getPeriodRange(period, customStart, customEnd);
    const periodOrders = orders.filter((order) => isInRange(order, range.start, range.end));
    const previousOrders = range.previousStart && range.previousEnd
      ? orders.filter((order) => isInRange(order, range.previousStart, range.previousEnd))
      : [];

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

    const current = summarize(periodOrders);
    const previous = summarize(previousOrders);
    const changeFor = (currentValue: number, previousValue: number) => range.previousStart
      ? percentageChange(currentValue, previousValue)
      : null;
    const metricSuffix = range.shortLabel === "hoje" ? "hoje" : range.shortLabel;
    const metrics: MetricCard[] = [
      { id: "revenue", label: `Faturamento (${metricSuffix})`, value: formatMoney(current.revenue), change: changeFor(current.revenue, previous.revenue), comparisonLabel: range.comparisonLabel, positiveIsGood: true, icon: CircleDollarSign, iconClass: "bg-orange-100 text-[var(--brand)]" },
      { id: "orders", label: `Pedidos (${metricSuffix})`, value: String(current.count), change: changeFor(current.count, previous.count), comparisonLabel: range.comparisonLabel, positiveIsGood: true, icon: ShoppingBag, iconClass: "bg-[#fff0e8] text-[var(--brand)]" },
      { id: "ticket", label: "Ticket médio", value: formatMoney(current.ticket), change: changeFor(current.ticket, previous.ticket), comparisonLabel: range.comparisonLabel, positiveIsGood: true, icon: BarChart3, iconClass: "bg-amber-100 text-amber-600" },
      { id: "completed", label: "Pedidos concluídos", value: String(current.completed), change: changeFor(current.completed, previous.completed), comparisonLabel: range.comparisonLabel, positiveIsGood: true, icon: CheckCircle2, iconClass: "bg-emerald-100 text-emerald-600" },
      { id: "canceled", label: "Pedidos cancelados", value: String(current.canceled), change: changeFor(current.canceled, previous.canceled), comparisonLabel: range.comparisonLabel, positiveIsGood: false, icon: XCircle, iconClass: "bg-red-100 text-red-600" },
    ];

    const validPeriodOrders = periodOrders.filter((order) => order.status !== "canceled");
    const productMap = new Map<string, number>();
    validPeriodOrders.forEach((order) => order.order_items?.forEach((item) => {
      const name = item.product_name?.trim();
      if (name) productMap.set(name, (productMap.get(name) || 0) + Number(item.quantity || 0));
    }));

    const topProducts: TopProductPoint[] = Array.from(productMap.entries())
      .map(([name, quantity]) => ({
        name: normalizeProductName(name),
        shortName: abbreviateProductName(name),
        quantity,
      }))
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
      orders: periodOrders.filter((order) => new Date(order.created_at).getHours() === hour).length,
    }));
    const peakHour = hourlyActivity.reduce(
      (peak, point) => point.orders > peak.orders ? point : peak,
      hourlyActivity[0] || { hour: 0, label: "00h", orders: 0 },
    );

    return {
      range,
      metrics,
      periodOrders,
      periodRevenue: current.revenue,
      revenueSeries: buildRevenueSeries(validPeriodOrders, period, range),
      topProducts,
      sources,
      sourceTotal: sources.reduce((sum, source) => sum + source.count, 0),
      hourlyActivity,
      peakHour,
      inKitchen: orders.filter((order) => order.status === "preparing").length,
      onTheWay: orders.filter((order) => order.status === "delivering").length,
      recentOrders: periodOrders.slice(0, 5),
    };
  }, [orders, period, customStart, customEnd]);

  if (loading) return <DashboardSkeleton />;
  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  const storeTone = {
    open: { shell: "border-emerald-100 bg-white", icon: "bg-emerald-500 text-white", title: "text-emerald-700", dot: "text-emerald-500", label: "Loja aberta", helper: "Recebendo pedidos" },
    closing: { shell: "border-amber-200 bg-amber-50", icon: "bg-amber-500 text-white", title: "text-amber-700", dot: "text-amber-500", label: "Fechando em breve", helper: "Confira os pedidos pendentes" },
    closed: { shell: "border-red-200 bg-red-50", icon: "bg-red-500 text-white", title: "text-red-700", dot: "text-red-500", label: "Loja fechada", helper: "Fora do horário de atendimento" },
  }[storeStatus.tone];
  const todayInput = toInputDate(new Date());

  return (
    <AdminPageShell className="space-y-5 sm:space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description={`Resumo da operação da ${restaurantName} em tempo real.`}
        action={
          <div className={`dashboard-store-card flex items-center gap-3 border px-4 py-3 shadow-sm ${storeTone.shell}`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${storeTone.icon}`}>
              <Store size={20} />
            </div>
            <div className="min-w-0 flex-1 sm:min-w-[150px]">
              <div className="flex items-center gap-2">
                <LiveStatusDot className={storeTone.dot} />
                <p className={`font-black ${storeTone.title}`}>{storeTone.label}</p>
              </div>
              <p className="mt-1 text-xs text-gray-500">{storeTone.helper}</p>
            </div>
            <Link
              href={restaurantSlug ? `/${restaurantSlug}` : "/admin/settings"}
              target={restaurantSlug ? "_blank" : undefined}
              className="hidden min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-bold text-gray-700 transition-colors hover:text-gray-950 sm:inline-flex"
            >
              Ver loja <ExternalLink size={14} />
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-2 text-xs font-bold text-[var(--brand)]">
          <LiveStatusDot className="text-current" /> Dashboard em tempo real
        </div>
        <div className="dashboard-period-control flex items-center gap-3">
          <label htmlFor="dashboard-period" className="text-sm font-bold text-gray-600">Período das métricas</label>
          <AdminSelect
            id="dashboard-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            className="min-h-11 w-[180px] py-2 text-sm"
            aria-label="Período global do dashboard"
          >
            {DASHBOARD_PERIODS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </AdminSelect>
        </div>
      </div>

      {period === "custom" ? (
        <section className="surface-card grid gap-4 rounded-[24px] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5" aria-label="Período personalizado do dashboard">
          <label className="grid gap-2 text-sm font-bold text-gray-700" htmlFor="dashboard-custom-start">
            Data inicial
            <AdminDatePicker
              value={customStart}
              label={formatRangeDate(parseInputDate(customStart) || new Date())}
              onChange={(value) => {
                setCustomStart(value);
                if (customEnd && value > customEnd) setCustomEnd(value);
              }}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-gray-700" htmlFor="dashboard-custom-end">
            Data final
            <AdminDatePicker
              value={customEnd}
              label={formatRangeDate(parseInputDate(customEnd) || new Date())}
              onChange={(value) => {
                setCustomEnd(value);
                if (customStart && value < customStart) setCustomStart(value);
              }}
            />
          </label>
          <div className="rounded-2xl bg-[#fff7f1] px-4 py-3 text-xs text-gray-600 sm:max-w-[230px]">
            <p className="font-black text-[var(--brand)]">{dashboard.range.label}</p>
            <p className="mt-1 leading-relaxed">Comparação automática com o período anterior de mesma duração.</p>
          </div>
        </section>
      ) : null}

      <section className="dashboard-metrics-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {dashboard.metrics.map((card) => <MetricCardView key={card.id} card={card} />)}
      </section>

      <section className="dashboard-analytics-grid grid gap-4 border-t border-[var(--line)] pt-6 xl:grid-cols-12">
        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-black text-gray-950">Faturamento</p>
              <p className="mt-1 text-xs text-gray-400">Evolução das vendas no período</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-gray-950">{formatMoney(dashboard.periodRevenue)}</p>
              <p className="text-xs font-semibold text-emerald-600">{dashboard.range.label}</p>
            </div>
          </div>
          <div className="mt-5 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.revenueSeries} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenuePeriod" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6a00" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#ff6a00" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#efe7df" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8c837c" }} minTickGap={20} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8c837c" }} tickFormatter={(value) => formatCompactMoney(Number(value))} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={{ borderRadius: 14, borderColor: "#eee3d9", boxShadow: "0 12px 30px rgba(63, 43, 29, 0.08)" }} />
                <Area type="monotone" dataKey="revenue" name="Faturamento" stroke="#ff6a00" strokeWidth={3} fill="url(#dashboardRevenuePeriod)" activeDot={{ r: 5, fill: "#ff6a00", stroke: "#ffffff", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-top-products-card surface-card overflow-visible p-4 sm:p-5 xl:col-span-3">
          <div className="dashboard-card-header flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-gray-950">Produtos mais pedidos</p>
              <p className="mt-1 text-xs text-gray-400">Ranking por quantidade</p>
            </div>
            <span className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-500">{dashboard.range.label}</span>
          </div>
          {dashboard.topProducts.length === 0 ? (
            <AdminEmptyState compact title="Nenhum produto vendido" description="Os produtos aparecerão aqui quando houver vendas no período." />
          ) : (
            <div className="mt-5 h-[250px] w-full overflow-visible">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.topProducts} layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    width={124}
                    tick={{ fontSize: 10, fill: "#554c46", fontWeight: 600 }}
                  />
                  <Tooltip
                    formatter={(value) => `${Number(value)} unidade(s)`}
                    labelFormatter={(label, payload) => {
                      const product = payload?.[0]?.payload as TopProductPoint | undefined;
                      return product?.name || String(label);
                    }}
                    wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                    contentStyle={{
                      maxWidth: "min(280px, calc(100vw - 2rem))",
                      border: "1px solid #f1ded0",
                      borderRadius: 14,
                      boxShadow: "0 16px 34px rgba(63, 43, 29, 0.16)",
                      whiteSpace: "normal",
                    }}
                    labelStyle={{ color: "#2f2925", fontWeight: 800, whiteSpace: "normal" }}
                  />
                  <Bar dataKey="quantity" name="Quantidade" fill="#ff6a00" radius={[0, 8, 8, 0]} barSize={11} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="dashboard-sources-card surface-card p-4 sm:p-5 xl:col-span-4">
          <p className="text-base font-black text-gray-950">Fontes de pedidos</p>
          <p className="mt-1 text-xs text-gray-400">Origem dos pedidos válidos em {dashboard.range.label.toLowerCase()}</p>
          {dashboard.sources.length === 0 ? (
            <AdminEmptyState compact title="Nenhum pedido registrado" description="Altere o período ou aguarde novos pedidos." />
          ) : (
            <div className="mt-3 grid items-center gap-3 sm:grid-cols-[1fr_150px]">
              <div className="relative h-[250px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(value) => `${Number(value)} pedido(s)`} />
                    <Pie data={dashboard.sources} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={84} paddingAngle={1}>
                      {dashboard.sources.map((source) => <Cell key={source.key} fill={source.color} />)}
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
                      <span className="shrink-0 font-bold text-gray-950">{source.count} ({percentage.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="dashboard-secondary-grid grid gap-4 xl:grid-cols-12">
        <article className="surface-card rounded-[24px] p-4 sm:p-5 xl:col-span-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-black text-gray-950">Atividade por horário</p>
              <p className="mt-1 text-xs text-gray-400">Pedidos distribuídos por hora em {dashboard.range.label.toLowerCase()}</p>
            </div>
            <span className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-500">{dashboard.range.label}</span>
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
                <p className="mt-3 text-xs font-bold text-gray-400">Pico no período</p>
                <p className="mt-1 text-lg font-black text-gray-950">{dashboard.peakHour.label} – {String((dashboard.peakHour.hour + 1) % 24).padStart(2, "0")}h</p>
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
              <p className="mt-1 text-xs text-gray-400">Últimos pedidos de {dashboard.range.label.toLowerCase()}</p>
            </div>
            <Link href="/admin/orders" className="text-xs font-black text-[var(--brand)] hover:underline">Ver todos</Link>
          </div>
          {dashboard.recentOrders.length === 0 ? (
            <AdminEmptyState compact title="Nenhum pedido recente" description="Os pedidos do período aparecerão aqui." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] border-collapse text-sm">
                  <thead>
                    <tr className="admin-table-header border-b border-[var(--line)] text-left">
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
                          <td className="px-5 py-3.5 font-black text-gray-950">#{order.display_number || order.id.slice(0, 5)}</td>
                          <td className="max-w-[150px] truncate px-3 py-3.5 font-semibold text-gray-700">{order.customer_name}</td>
                          <td className="px-3 py-3.5"><span className="inline-flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />{source.label}</span></td>
                          <td className="whitespace-nowrap px-3 py-3.5">{formatDateTime(order.created_at)}</td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-bold text-gray-950">{formatMoney(order.total)}</td>
                          <td className="px-3 py-3.5"><span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span></td>
                          <td className="px-3 py-3.5 text-gray-400"><MoreVertical size={16} /></td>
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
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#f8f3ec] px-3 py-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: source.color }} />{source.label}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f8f3ec] px-3 py-1.5"><Clock3 size={13} /> {formatHour(order.created_at)}</span>
                        <span className={`inline-flex rounded-full border px-3 py-1.5 font-bold ${status.className}`}>{status.label}</span>
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
