"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  MessageCircle,
  Search,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { PERIOD_OPTIONS, PeriodKey, isWithinPeriod } from "@/lib/admin-period";
import { useToast } from "@/components/ui/toast-provider";
import { OrderStatusBadge } from "@/components/ui/order-status-badge";
import { getOrderStatusLabel } from "@/lib/order-status";

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
  created_at: string;
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

function exportExcel(rows: HistoryOrder[]) {
  const header = ["Data", "Hora", "Pedido", "Cliente", "Telefone", "Situação", "Pagamento", "Subtotal", "Entrega", "Desconto", "Total"];
  const lines = rows.map((order) => [
    formatDate(order.created_at),
    formatHour(order.created_at),
    order.id.slice(0, 4),
    order.customer_name,
    order.customer_phone,
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
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-40 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
      </div>
      <div className="surface-card rounded-[28px] p-6">
        <div className="h-12 rounded-2xl bg-white" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-white" />
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
  const { showToast } = useToast();

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = async () => {
    try {
      const { restaurant, user } = await getCurrentRestaurant(supabase);
      if (!user) return router.push("/admin/login");
      if (!restaurant) {
        setErrorMsg("Não foi possível localizar a loja.");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, customer_phone, total, subtotal, delivery_fee, discount, status, payment_method, created_at")
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

      const matchesSearch =
        term.length === 0
          ? true
          : order.id.toLowerCase().includes(term) ||
            order.customer_name.toLowerCase().includes(term) ||
            order.customer_phone.toLowerCase().includes(term);

      return (period === "custom" ? matchesCustomPeriod : matchesPeriod) && matchesFilter && matchesSearch;
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
    const totalSales = visibleOrders
      .filter((order) => order.status !== "canceled")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      count: visibleOrders.length,
      value: totalSales,
    };
  }, [visibleOrders]);

  useEffect(() => {
    setPage(1);
  }, [customEndDate, customStartDate, query, filter, period]);

  const handleCopyOrder = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      showToast({
        title: "Pedido copiado",
        description: "O identificador completo foi copiado para a área de transferência.",
        tone: "success",
      });
    } catch (error) {
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
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950">Pedidos</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Consulte todo o histórico da operação da sua loja.
            </p>
          </div>
        </div>
        <button
          onClick={() => exportExcel(visibleOrders)}
          className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
        >
          <Download size={16} />
          Exportar
        </button>
      </div>

      <section className="surface-card rounded-[28px] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <Search size={18} className="text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o número do pedido, cliente ou telefone"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filter === item.id
                  ? "bg-[#171311] text-white"
                  : "border border-[var(--line)] bg-white text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setPeriod(item.id);

                if (item.id === "custom" && (!customStartDate || !customEndDate)) {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 29);
                  setCustomStartDate(formatInputDate(start));
                  setCustomEndDate(formatInputDate(end));
                }
              }}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                period === item.id
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border border-[var(--line)] bg-white text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-4 md:grid-cols-2">
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
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white">
          <div className="grid grid-cols-[88px_1.1fr_1fr_minmax(118px,0.9fr)_0.9fr_140px_132px] gap-4 border-b border-[var(--line)] px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            <span className="whitespace-nowrap">Horário</span>
            <span>Pedido</span>
            <span>Cliente</span>
            <span className="whitespace-nowrap">Situação</span>
            <span className="whitespace-nowrap">Valor da venda</span>
            <span className="whitespace-nowrap text-right">Líquido</span>
            <span className="whitespace-nowrap text-right">Ações</span>
          </div>

          <div className="border-b border-[var(--line)] bg-[#fcfaf7] px-6 py-4 text-sm text-gray-500">
            <span className="font-bold text-gray-950">{summary.count} pedidos</span>
            <span> • Valor das vendas de {formatMoney(summary.value)}</span>
          </div>

          <div className="divide-y divide-[var(--line)]">
            {paginatedOrders.length === 0 ? (
              <div className="flex min-h-[340px] items-center justify-center px-6 py-16 text-center text-sm text-gray-500">
                Nenhum pedido encontrado para este filtro.
              </div>
            ) : (
              groupedOrders.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#fcfaf7] px-6 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-950">{group.label}</span>
                      <span className="text-gray-400">{group.orders.length} pedidos</span>
                    </div>
                    <span className="font-semibold text-gray-500">
                      Valor das vendas de {formatMoney(group.total)}
                    </span>
                  </div>

                  {group.orders.map((order) => (
                    <div
                      key={order.id}
                      className="grid grid-cols-[88px_1.1fr_1fr_minmax(118px,0.9fr)_0.9fr_140px_132px] gap-4 px-6 py-5 text-sm text-gray-700"
                    >
                      <div className="font-bold text-gray-950">{formatHour(order.created_at)}</div>
                      <div>
                        <p className="font-bold text-gray-950">#{order.id.slice(0, 4)}</p>
                        <p className="mt-1 text-xs text-gray-400">{formatDate(order.created_at)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-950">{order.customer_name}</p>
                        <p className="mt-1 text-xs text-gray-400">{order.customer_phone}</p>
                      </div>
                      <div>
                        <OrderStatusBadge status={order.status} className="whitespace-nowrap" />
                      </div>
                      <div className="font-semibold text-gray-950">
                        {formatMoney(Number(order.total || 0))}
                      </div>
                      <div className="text-right font-semibold text-gray-700">
                        {formatMoney(Number(order.total || 0) - Number(order.discount || 0))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleCopyOrder(order.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600"
                          title="Copiar ID do pedido"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          onClick={() => window.open(`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`, "_blank")}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {visibleOrders.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[var(--line)] px-6 py-4 text-sm text-gray-500">
              <p>
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 font-semibold disabled:opacity-50"
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
