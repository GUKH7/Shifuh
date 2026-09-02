"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  Gift,
  Percent,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import {
  AdminPageHeader,
  AdminPageShell,
} from "@/components/ui/admin-primitives";
import {
  AdminErrorState,
  AdminPageSkeleton,
} from "@/components/ui/admin-page-states";

type Coupon = {
  id: string;
  code: string;
  active: boolean;
  expires_at: string | null;
  usage_limit: number | null;
};

type PromotionOrder = {
  id: string;
  coupon_code: string | null;
  customer_phone: string | null;
  total: number | null;
  discount: number | null;
  status: string | null;
  created_at: string;
};

const PROMOTION_PAGE_SIZE = 1000;

const FUTURE_MECHANICS = [
  {
    title: "Desconto automático",
    description: "Aplique ofertas por regra, sem exigir que o cliente digite um código.",
    icon: BadgePercent,
  },
  {
    title: "Fidelidade",
    description: "Recompense frequência e recorrência com benefícios progressivos.",
    icon: Sparkles,
  },
  {
    title: "Cashback",
    description: "Transforme parte da compra atual em saldo para um próximo pedido.",
    icon: Wallet,
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function PromotionsOverview() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [overviewLoadedAt, setOverviewLoadedAt] = useState(0);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
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

        const fetchAllCoupons = async () => {
          const allCoupons: Coupon[] = [];
          let from = 0;

          while (true) {
            const { data, error } = await (supabase as any)
              .from("coupons")
              .select("id, code, active, expires_at, usage_limit")
              .eq("restaurant_id", restaurant.id)
              .order("id", { ascending: true })
              .range(from, from + PROMOTION_PAGE_SIZE - 1);

            if (error) throw error;

            const page = (data || []) as Coupon[];
            allCoupons.push(...page);

            if (page.length < PROMOTION_PAGE_SIZE) break;
            from += PROMOTION_PAGE_SIZE;
          }

          return allCoupons;
        };

        const fetchAllPromotionOrders = async () => {
          const allOrders: PromotionOrder[] = [];
          let from = 0;

          while (true) {
            const { data, error } = await (supabase as any)
              .from("orders")
              .select("id, coupon_code, customer_phone, total, discount, status, created_at")
              .eq("restaurant_id", restaurant.id)
              .not("coupon_code", "is", null)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, from + PROMOTION_PAGE_SIZE - 1);

            if (error) throw error;

            const page = (data || []) as PromotionOrder[];
            allOrders.push(...page);

            if (page.length < PROMOTION_PAGE_SIZE) break;
            from += PROMOTION_PAGE_SIZE;
          }

          return allOrders;
        };

        const [allCoupons, promotionOrders] = await Promise.all([
          fetchAllCoupons(),
          fetchAllPromotionOrders(),
        ]);

        if (!active) return;

        setCoupons(allCoupons);
        setOrders(promotionOrders);
        setOverviewLoadedAt(Date.now());
      } catch (error) {
        console.error(error);
        if (active) setErrorMsg("Erro ao carregar a visão geral de promoções.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOverview();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const summary = useMemo(() => {
    const uniqueCustomers = new Set<string>();
    const usageByCouponCode = new Map<string, number>();
    let convertedRevenue = 0;
    let promotionalInvestment = 0;
    let totalUses = 0;

    orders.forEach((order) => {
      if (order.coupon_code) {
        usageByCouponCode.set(
          order.coupon_code,
          (usageByCouponCode.get(order.coupon_code) || 0) + 1,
        );
      }

      if (order.status === "canceled") return;

      totalUses += 1;
      if (order.customer_phone) uniqueCustomers.add(order.customer_phone);
      convertedRevenue += Number(order.total || 0);
      promotionalInvestment += Number(order.discount || 0);
    });

    const now = overviewLoadedAt;
    const activeCoupons = coupons.filter((coupon) => {
      if (!coupon.active) return false;

      if (coupon.expires_at) {
        const expiresAt = new Date(coupon.expires_at).getTime();
        if (Number.isFinite(expiresAt) && expiresAt < now) return false;
      }

      if (coupon.usage_limit) {
        const usageCount = usageByCouponCode.get(coupon.code) || 0;
        if (usageCount >= Number(coupon.usage_limit)) return false;
      }

      return true;
    }).length;

    const returnRate = promotionalInvestment > 0 ? convertedRevenue / promotionalInvestment : 0;

    return {
      activePromotions: activeCoupons,
      activeCoupons,
      totalCoupons: coupons.length,
      impactedCustomers: uniqueCustomers.size,
      convertedRevenue,
      promotionalInvestment,
      totalUses,
      returnRate,
    };
  }, [coupons, orders, overviewLoadedAt]);

  if (loading) {
    return <AdminPageSkeleton ariaLabel="Carregando visão geral de promoções" metrics={4} />;
  }

  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  const metrics = [
    {
      label: "Promoções ativas",
      value: String(summary.activePromotions),
      helper: "Cupons disponíveis para uso agora",
      icon: Percent,
    },
    {
      label: "Clientes impactados",
      value: String(summary.impactedCustomers),
      helper: `${summary.totalUses} usos promocionais válidos registrados`,
      icon: Users,
    },
    {
      label: "Receita gerada",
      value: formatMoney(summary.convertedRevenue),
      helper: "Pedidos com promoção, exceto cancelados",
      icon: TrendingUp,
    },
    {
      label: "Investimento promocional",
      value: formatMoney(summary.promotionalInvestment),
      helper: summary.returnRate ? `${summary.returnRate.toFixed(1)}x de retorno por desconto` : "Sem retorno calculado ainda",
      icon: Wallet,
    },
  ];

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Promoções"
        description="Acompanhe o impacto das campanhas da loja e acesse cada mecânica promocional em um só lugar."
        icon={<Percent size={24} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="surface-card rounded-[24px] border-orange-100 bg-[linear-gradient(145deg,#ffffff_0%,#fff8f3_100%)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">{metric.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-tight text-gray-950">{metric.value}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand)] shadow-sm">
                  <Icon size={18} />
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-400">{metric.helper}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/admin/promotions/coupons"
          className="surface-card group rounded-[28px] p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Ticket size={20} />
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              Disponível
            </span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">Cupons</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Crie códigos promocionais, ative ou pause campanhas e acompanhe o resultado de cada cupom.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.activeCoupons} ativos</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.totalCoupons} cadastrados</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.totalUses} usos</span>
          </div>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]">
            Gerenciar cupons <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          href="/admin/promotions/wheel"
          className="surface-card group rounded-[28px] p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Gift size={20} />
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              Disponível
            </span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">Roleta da Sorte</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Defina período, regras de liberação, janelas de horário e limites por cliente antes de configurar os prêmios.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Regras de giro</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Período</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Limites</span>
          </div>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]">
            Configurar roleta <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      <section className="surface-card rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Próximas mecânicas</p>
            <h2 className="mt-2 text-xl font-black text-gray-950">Mais formas de ativar e reter clientes</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-gray-500">
            Estes módulos já têm espaço reservado na arquitetura de Promoções e poderão ser adicionados sem aumentar o menu principal.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {FUTURE_MECHANICS.map((mechanic) => {
            const Icon = mechanic.icon;
            return (
              <article key={mechanic.title} className="rounded-2xl border border-[var(--line)] bg-[#fffdfa] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[var(--brand)] shadow-sm">
                    <Icon size={18} />
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500">
                    Planejado
                  </span>
                </div>
                <h3 className="mt-4 font-black text-gray-950">{mechanic.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">{mechanic.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </AdminPageShell>
  );
}
