"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bike,
  Clock3,
  Loader2,
  PackageCheck,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { PERIOD_OPTIONS, PeriodKey, isWithinPeriod } from "@/lib/admin-period";

type OrderRow = {
  id: string;
  customer_name: string;
  total: number;
  status: "pending" | "preparing" | "delivering" | "done" | "canceled";
  created_at: string;
  order_items: Array<{
    product_name: string;
    quantity: number;
  }>;
};

type MetricCard = {
  label: string;
  value: string;
  helper: string;
};

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

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white" />
        <div className="space-y-3">
          <div className="h-6 w-64 rounded-full bg-white" />
          <div className="h-4 w-80 rounded-full bg-white" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="surface-card rounded-[24px] p-5">
            <div className="h-4 w-24 rounded-full bg-white" />
            <div className="mt-4 h-8 w-32 rounded-full bg-white" />
            <div className="mt-3 h-3 w-36 rounded-full bg-white" />
          </div>
        ))}
      </div>
    </div>
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
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("7d");

  useEffect(() => {
    fetchDashboard();
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

      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_name, total, status, created_at, order_items (product_name, quantity)")
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

  const dashboard = useMemo(() => {
    const filteredOrders = orders.filter((order) => isWithinPeriod(order.created_at, period));
    const activeOrders = filteredOrders.filter((order) => order.status !== "canceled");
    const completedOrders = filteredOrders.filter((order) => order.status === "done");
    const canceledOrders = filteredOrders.filter((order) => order.status === "canceled");
    const grossRevenue = activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const averageTicket = activeOrders.length > 0 ? grossRevenue / activeOrders.length : 0;
    const inKitchen = filteredOrders.filter((order) => order.status === "preparing").length;
    const onTheWay = filteredOrders.filter((order) => order.status === "delivering").length;

    const productRankingMap = new Map<string, number>();
    filteredOrders.forEach((order) => {
      order.order_items?.forEach((item) => {
        const current = productRankingMap.get(item.product_name) || 0;
        productRankingMap.set(item.product_name, current + Number(item.quantity || 0));
      });
    });

    const topProducts = Array.from(productRankingMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const recentOrders = filteredOrders.slice(0, 5);

    const cards: MetricCard[] = [
      {
        label: "Faturamento bruto",
        value: formatMoney(grossRevenue),
        helper: `${activeOrders.length} pedido(s) validos`,
      },
      {
    label: "Ticket médio",
        value: formatMoney(averageTicket),
    helper: "média por pedido não cancelado",
      },
      {
    label: "Pedidos no período",
        value: String(filteredOrders.length),
    helper: `${completedOrders.length} concluídos`,
      },
      {
        label: "Cancelados",
        value: String(canceledOrders.length),
        helper: `${formatMoney(grossRevenue)} em vendas`,
      },
    ];

    return {
      cards,
      topProducts,
      recentOrders,
      filteredOrdersCount: filteredOrders.length,
      inKitchen,
      onTheWay,
    };
  }, [orders, period]);

  if (loading) return <DashboardSkeleton />;

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-red-700">
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center gap-4">
        <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm">
          <Store size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Painel operacional</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
          Acompanhe pedidos, faturamento e ritmo da operação da {restaurantName}.
          </p>
        </div>
      </div>

      <section className="surface-card rounded-[28px] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-bold text-[var(--brand)]">
              Dashboard em tempo real
            </div>
            <h2 className="mt-4 text-2xl font-black text-gray-950">
            Sua operação centralizada em um painel leve.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Veja faturamento, pedidos e os produtos que mais giram sem sair do fluxo da loja.
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 rounded-2xl border border-[#ffd8ca] bg-[var(--brand-soft)] px-5 py-3 text-sm font-bold text-[var(--brand)]"
          >
            Ir para pedidos <ArrowUpRight size={16} />
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriod(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                period === item.id
                  ? "bg-[#171311] text-white"
                  : "border border-[var(--line)] bg-white text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <div className="mt-3">
                <p className="text-3xl font-black text-gray-950">{card.value}</p>
                <p className="mt-2 text-xs font-medium text-gray-400">{card.helper}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-gray-950">Atalhos da operação</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
              O caminho mais rápido para manter a loja publicada e recebendo pedidos.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Link href="/admin/orders" className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <ShoppingBag className="text-[var(--brand)]" size={22} />
              <h4 className="mt-4 font-bold text-gray-950">Pedidos</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Aceite, despache e conclua pedidos em tempo real.
              </p>
            </Link>
            <Link href="/admin/menu" className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <PackageCheck className="text-[var(--brand)]" size={22} />
                <h4 className="mt-4 font-bold text-gray-950">Cardápio</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Crie categorias, organize itens e pause produtos.
              </p>
            </Link>
            <Link href="/admin/settings" className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <Wallet className="text-[var(--brand)]" size={22} />
                <h4 className="mt-4 font-bold text-gray-950">Configurações</h4>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Atualize WhatsApp, endereço e faixas de entrega.
              </p>
            </Link>
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-6">
          <h3 className="text-xl font-black text-gray-950">Pulso da loja</h3>
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <p className="font-bold text-emerald-800">Loja em operação</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-700">
              Sua vitrine esta pronta para receber pedidos e enviar tudo direto no WhatsApp.
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">No período</p>
              <p className="mt-2 text-2xl font-black text-gray-950">{dashboard.filteredOrdersCount}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Em preparo</p>
              <p className="mt-2 text-2xl font-black text-gray-950">{dashboard.inKitchen}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Em rota</p>
              <p className="mt-2 text-2xl font-black text-gray-950">{dashboard.onTheWay}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-card rounded-[28px] p-6">
          <h3 className="text-xl font-black text-gray-950">Top produtos</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Itens mais vendidos com base nos pedidos do período.
          </p>
          <div className="mt-6 space-y-3">
            {dashboard.topProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white py-12 text-center text-sm text-gray-500">
              Nenhum produto vendido no período selecionado.
              </div>
            ) : (
              dashboard.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#faf4ee] text-sm font-black text-[var(--brand)]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-bold text-gray-950">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.quantity} unidade(s)</p>
                    </div>
                  </div>
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-[#f3ebe4]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${Math.max(20, (product.quantity / (dashboard.topProducts[0]?.quantity || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-6">
          <h3 className="text-xl font-black text-gray-950">Ultimos pedidos</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Visão rápida dos pedidos mais recentes no período.
          </p>
          <div className="mt-6 space-y-3">
            {dashboard.recentOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white py-12 text-center text-sm text-gray-500">
              Nenhum pedido registrado no período selecionado.
              </div>
            ) : (
              dashboard.recentOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-950">#{order.id.slice(0, 4)} • {order.customer_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={14} />
                        {formatHour(order.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Bike size={14} />
                        {order.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-black text-gray-950">{formatMoney(order.total)}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                      {order.order_items?.length || 0} item(ns)
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
