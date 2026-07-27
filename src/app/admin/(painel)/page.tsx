"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bike,
  Clock3,
  PackageCheck,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { AdminPageHeader, AdminPageShell, AdminSkeleton } from "@/components/ui/admin-primitives";
import { LiveStatusDot } from "@/components/ui/live-status-dot";
import { PERIOD_OPTIONS, type PeriodKey, isWithinPeriod } from "@/lib/admin-period";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type OrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

type OrderRow = {
  id: string;
  customer_name: string;
  total: number;
  status: OrderStatus;
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

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  preparing: "Em preparo",
  delivering: "Em rota",
  done: "Concluído",
  canceled: "Cancelado",
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
    <AdminPageShell className="space-y-6">
      <div className="flex items-center gap-4">
        <AdminSkeleton className="h-14 w-14 shrink-0" />
        <div className="w-full max-w-md space-y-3">
          <AdminSkeleton className="h-7 w-52" />
          <AdminSkeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="surface-card rounded-[28px] p-4 sm:p-6">
        <AdminSkeleton className="h-24 w-full" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <AdminSkeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSkeleton className="h-80 w-full" />
        <AdminSkeleton className="h-80 w-full" />
      </div>
    </AdminPageShell>
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

    const productRankingMap = new Map<string, number>();
    filteredOrders.forEach((order) => {
      order.order_items?.forEach((item) => {
        productRankingMap.set(
          item.product_name,
          (productRankingMap.get(item.product_name) || 0) + Number(item.quantity || 0),
        );
      });
    });

    const topProducts = Array.from(productRankingMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const cards: MetricCard[] = [
      {
        label: "Faturamento bruto",
        value: formatMoney(grossRevenue),
        helper: `${activeOrders.length} pedido(s) válidos`,
      },
      {
        label: "Ticket médio",
        value: formatMoney(averageTicket),
        helper: "Média por pedido não cancelado",
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
      recentOrders: filteredOrders.slice(0, 5),
      filteredOrdersCount: filteredOrders.length,
      inKitchen: filteredOrders.filter((order) => order.status === "preparing").length,
      onTheWay: filteredOrders.filter((order) => order.status === "delivering").length,
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

  const maxProductQuantity = dashboard.topProducts[0]?.quantity || 1;

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description={`Acompanhe pedidos, faturamento e ritmo da operação da ${restaurantName}.`}
        icon={<Store size={24} />}
      />

      <section className="surface-card rounded-[28px] p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-3 py-2 text-xs font-bold text-[var(--brand)]">
              <LiveStatusDot className="text-current" />
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#ffd8ca] bg-[var(--brand-soft)] px-5 py-3 text-sm font-bold text-[var(--brand)] transition-colors hover:bg-[#ffe8dc]"
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
                  : "border border-[var(--line)] bg-white text-gray-600 hover:text-gray-950"
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
              <p className="mt-3 text-3xl font-black text-gray-950">{card.value}</p>
              <p className="mt-2 text-xs font-medium text-gray-400">{card.helper}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card rounded-[28px] p-4 sm:p-6">
          <h3 className="text-xl font-black text-gray-950">Atalhos da operação</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            O caminho mais rápido para manter a loja publicada e recebendo pedidos.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { href: "/admin/orders", icon: ShoppingBag, title: "Pedidos", text: "Aceite, despache e conclua pedidos em tempo real." },
              { href: "/admin/menu", icon: PackageCheck, title: "Cardápio", text: "Crie categorias, organize itens e pause produtos." },
              { href: "/admin/settings", icon: Wallet, title: "Configurações", text: "Atualize WhatsApp, endereço e faixas de entrega." },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl border border-[var(--line)] bg-white p-5 transition-colors hover:border-[#ffd8ca]">
                <item.icon className="text-[var(--brand)]" size={22} />
                <h4 className="mt-4 font-bold text-gray-950">{item.title}</h4>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.text}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-4 sm:p-6">
          <div className="flex items-center gap-2 text-[var(--brand)]">
            <Store size={20} />
            <h3 className="text-xl font-black">Operação de hoje</h3>
          </div>
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <LiveStatusDot />
              <p className="font-bold text-emerald-800">Loja em operação</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-700">
              Sua vitrine está pronta para receber pedidos e enviar tudo direto no WhatsApp.
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

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-card rounded-[28px] p-4 sm:p-6">
          <h3 className="text-xl font-black text-gray-950">Produtos mais pedidos</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Comparação visual dos itens mais vendidos no período.
          </p>
          <div className="mt-6 space-y-5">
            {dashboard.topProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white py-12 text-center text-sm text-gray-500">
                Nenhum produto vendido no período selecionado.
              </div>
            ) : (
              dashboard.topProducts.map((product, index) => {
                const percentage = Math.max(8, (product.quantity / maxProductQuantity) * 100);
                return (
                  <div key={product.name}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-xs font-black text-[var(--brand)]">
                          {index + 1}
                        </span>
                        <span className="truncate font-bold text-gray-950">{product.name}</span>
                      </div>
                      <span className="shrink-0 font-bold text-gray-600">{product.quantity}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#f3ebe4]" aria-label={`${product.name}: ${product.quantity} unidades`}>
                      <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="surface-card rounded-[28px] p-4 sm:p-6">
          <h3 className="text-xl font-black text-gray-950">Últimos pedidos</h3>
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
                      <span className="inline-flex items-center gap-1"><Clock3 size={14} />{formatHour(order.created_at)}</span>
                      <span className="inline-flex items-center gap-1"><Bike size={14} />{STATUS_LABELS[order.status]}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-black text-gray-950">{formatMoney(order.total)}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                      {order.order_items?.length || 0} {(order.order_items?.length || 0) === 1 ? "item" : "itens"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </AdminPageShell>
  );
}
