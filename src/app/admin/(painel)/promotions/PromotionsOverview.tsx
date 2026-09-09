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

type WheelCampaign = {
  id: string;
  status: "draft" | "scheduled" | "active" | "paused" | "ended";
  starts_at: string | null;
  ends_at: string | null;
};

type WheelSpin = {
  id: string;
  campaign_id: string;
  customer_id: string;
  status: "resolved";
  created_at: string;
};

type WheelReward = {
  id: string;
  campaign_id: string;
  customer_id: string;
  status: "available" | "redeemed" | "expired" | "cancelled";
  redeemed_order_id: string | null;
  created_at: string;
};

type CustomerIdentity = {
  id: string;
  phone: string;
};

const PROMOTION_PAGE_SIZE = 1000;
const QUERY_CHUNK_SIZE = 120;

const FUTURE_MECHANICS = [
  {
    title: "Desconto automático",
    description: "Aplique ofertas por regra, sem exigir que o cliente digite um código.",
    icon: BadgePercent,
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

function normalizePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
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
  const [couponOrders, setCouponOrders] = useState<PromotionOrder[]>([]);
  const [wheelCampaigns, setWheelCampaigns] = useState<WheelCampaign[]>([]);
  const [wheelSpins, setWheelSpins] = useState<WheelSpin[]>([]);
  const [wheelRewards, setWheelRewards] = useState<WheelReward[]>([]);
  const [wheelOrders, setWheelOrders] = useState<PromotionOrder[]>([]);
  const [wheelCustomers, setWheelCustomers] = useState<CustomerIdentity[]>([]);
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

        const fetchPaginated = async <T,>(buildQuery: (from: number, to: number) => any) => {
          const rows: T[] = [];
          let from = 0;

          while (true) {
            const { data, error } = await buildQuery(from, from + PROMOTION_PAGE_SIZE - 1);
            if (error) throw error;

            const page = (data || []) as T[];
            rows.push(...page);
            if (page.length < PROMOTION_PAGE_SIZE) break;
            from += PROMOTION_PAGE_SIZE;
          }

          return rows;
        };

        const [allCoupons, promotionOrders, campaigns, resolvedSpins, rewards] = await Promise.all([
          fetchPaginated<Coupon>((from, to) =>
            (supabase as any)
              .from("coupons")
              .select("id, code, active, expires_at, usage_limit")
              .eq("restaurant_id", restaurant.id)
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchPaginated<PromotionOrder>((from, to) =>
            (supabase as any)
              .from("orders")
              .select("id, coupon_code, customer_phone, total, discount, status, created_at")
              .eq("restaurant_id", restaurant.id)
              .not("coupon_code", "is", null)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchPaginated<WheelCampaign>((from, to) =>
            (supabase as any)
              .from("promotion_campaigns")
              .select("id, status, starts_at, ends_at")
              .eq("restaurant_id", restaurant.id)
              .eq("kind", "roulette")
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchPaginated<WheelSpin>((from, to) =>
            (supabase as any)
              .from("promotion_spins")
              .select("id, campaign_id, customer_id, status, created_at")
              .eq("restaurant_id", restaurant.id)
              .eq("status", "resolved")
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchPaginated<WheelReward>((from, to) =>
            (supabase as any)
              .from("customer_rewards")
              .select("id, campaign_id, customer_id, status, redeemed_order_id, created_at")
              .eq("restaurant_id", restaurant.id)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ]);

        const redeemedOrderIds = Array.from(
          new Set(
            rewards
              .filter((reward) => reward.status === "redeemed" && reward.redeemed_order_id)
              .map((reward) => reward.redeemed_order_id as string),
          ),
        );
        const wheelCustomerIds = Array.from(new Set(resolvedSpins.map((spin) => spin.customer_id)));

        const [wheelOrderPages, customerPages] = await Promise.all([
          Promise.all(
            chunk(redeemedOrderIds, QUERY_CHUNK_SIZE).map(async (ids) => {
              const { data, error } = await (supabase as any)
                .from("orders")
                .select("id, coupon_code, customer_phone, total, discount, status, created_at")
                .eq("restaurant_id", restaurant.id)
                .in("id", ids);
              if (error) throw error;
              return (data || []) as PromotionOrder[];
            }),
          ),
          Promise.all(
            chunk(wheelCustomerIds, QUERY_CHUNK_SIZE).map(async (ids) => {
              const { data, error } = await (supabase as any)
                .from("customers")
                .select("id, phone")
                .eq("restaurant_id", restaurant.id)
                .in("id", ids);
              if (error) throw error;
              return (data || []) as CustomerIdentity[];
            }),
          ),
        ]);

        if (!active) return;

        setCoupons(allCoupons);
        setCouponOrders(promotionOrders);
        setWheelCampaigns(campaigns);
        setWheelSpins(resolvedSpins);
        setWheelRewards(rewards);
        setWheelOrders(wheelOrderPages.flat());
        setWheelCustomers(customerPages.flat());
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
    const usageByCouponCode = new Map<string, number>();
    couponOrders.forEach((order) => {
      if (!order.coupon_code) return;
      usageByCouponCode.set(
        order.coupon_code,
        (usageByCouponCode.get(order.coupon_code) || 0) + 1,
      );
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

    const activeWheelCampaigns = wheelCampaigns.filter((campaign) => {
      if (campaign.status !== "active") return false;

      if (campaign.starts_at) {
        const startsAt = new Date(campaign.starts_at).getTime();
        if (Number.isFinite(startsAt) && startsAt > now) return false;
      }

      if (campaign.ends_at) {
        const endsAt = new Date(campaign.ends_at).getTime();
        if (Number.isFinite(endsAt) && endsAt <= now) return false;
      }

      return true;
    }).length;

    const validCouponOrders = couponOrders.filter((order) => order.status !== "canceled");
    const validWheelOrders = wheelOrders.filter((order) => order.status !== "canceled");
    const validWheelOrderIds = new Set(validWheelOrders.map((order) => order.id));
    const usedWheelRewards = wheelRewards.filter(
      (reward) =>
        reward.status === "redeemed" &&
        reward.redeemed_order_id &&
        validWheelOrderIds.has(reward.redeemed_order_id),
    );

    const promotionalOrders = new Map<string, PromotionOrder>();
    validCouponOrders.forEach((order) => promotionalOrders.set(order.id, order));
    validWheelOrders.forEach((order) => promotionalOrders.set(order.id, order));

    const convertedRevenue = Array.from(promotionalOrders.values()).reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    );
    const promotionalInvestment = Array.from(promotionalOrders.values()).reduce(
      (sum, order) => sum + Number(order.discount || 0),
      0,
    );

    const customerPhoneById = new Map(
      wheelCustomers.map((customer) => [customer.id, normalizePhone(customer.phone)] as const),
    );
    const impactedCustomers = new Set<string>();

    validCouponOrders.forEach((order) => {
      const phone = normalizePhone(order.customer_phone);
      if (phone) impactedCustomers.add(`phone:${phone}`);
    });

    wheelSpins.forEach((spin) => {
      const phone = customerPhoneById.get(spin.customer_id);
      impactedCustomers.add(phone ? `phone:${phone}` : `customer:${spin.customer_id}`);
    });

    const returnRate = promotionalInvestment > 0 ? convertedRevenue / promotionalInvestment : 0;

    return {
      activePromotions: activeCoupons + activeWheelCampaigns,
      activeCoupons,
      totalCoupons: coupons.length,
      couponUses: validCouponOrders.length,
      activeWheelCampaigns,
      totalWheelCampaigns: wheelCampaigns.length,
      resolvedWheelSpins: wheelSpins.length,
      wheelPrizesDistributed: wheelRewards.length,
      wheelPrizesUsed: usedWheelRewards.length,
      impactedCustomers: impactedCustomers.size,
      convertedRevenue,
      promotionalInvestment,
      promotionalOrders: promotionalOrders.size,
      totalInteractions: validCouponOrders.length + wheelSpins.length,
      returnRate,
    };
  }, [coupons, couponOrders, wheelCampaigns, wheelSpins, wheelRewards, wheelOrders, wheelCustomers, overviewLoadedAt]);

  if (loading) {
    return <AdminPageSkeleton ariaLabel="Carregando visão geral de promoções" metrics={4} />;
  }

  if (errorMsg) return <AdminErrorState description={errorMsg} />;

  const metrics = [
    {
      label: "Promoções ativas",
      value: String(summary.activePromotions),
      helper: `${summary.activeCoupons} cupom(ns) • ${summary.activeWheelCampaigns} roleta(s) ativa(s)`,
      icon: Percent,
    },
    {
      label: "Clientes impactados",
      value: String(summary.impactedCustomers),
      helper: `${summary.couponUses} uso(s) de cupom • ${summary.resolvedWheelSpins} giro(s) resolvido(s)`,
      icon: Users,
    },
    {
      label: "Receita gerada",
      value: formatMoney(summary.convertedRevenue),
      helper: `${summary.promotionalOrders} pedido(s) promocional(is) único(s), exceto cancelados`,
      icon: TrendingUp,
    },
    {
      label: "Investimento promocional",
      value: formatMoney(summary.promotionalInvestment),
      helper: summary.returnRate
        ? `${summary.returnRate.toFixed(1)}x de retorno • produto grátis sem CMV cadastrado`
        : "Sem retorno calculado ainda • produto grátis sem CMV cadastrado",
      icon: Wallet,
    },
  ];

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Promoções"
        description="Gerencie Cupons, Roleta da Sorte e Fidelidade. Os indicadores consolidados abaixo refletem cupons e roleta, que já possuem mensuração promocional direta."
        icon={<Percent size={24} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="surface-card rounded-2xl border-orange-100 bg-[linear-gradient(145deg,#ffffff_0%,#fff8f3_100%)] p-5"
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

      <section className="grid gap-4 lg:grid-cols-3">
        <Link
          href="/admin/promotions/coupons"
          className="surface-card group rounded-3xl p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Ticket size={20} />
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Disponível</span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">Cupons</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Crie códigos promocionais, ative ou pause campanhas e acompanhe o resultado de cada cupom.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.activeCoupons} ativos</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.totalCoupons} cadastrados</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.couponUses} usos válidos</span>
          </div>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]">
            Gerenciar cupons <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          href="/admin/promotions/wheel"
          className="surface-card group rounded-3xl p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Gift size={20} />
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Disponível</span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">Roleta da Sorte</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Configure campanhas, regras e prêmios e acompanhe giros, resgates, receita e retorno da mecânica.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.activeWheelCampaigns} ativa(s)</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.resolvedWheelSpins} giros</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{summary.wheelPrizesUsed} prêmios usados</span>
          </div>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]">
            Gerenciar roleta <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>

        <Link
          href="/admin/promotions/loyalty"
          className="surface-card group rounded-3xl p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Sparkles size={20} />
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Disponível</span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">Fidelidade</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Recompense recorrência com pontos, catálogo de benefícios, resgate no checkout e gestão de desempenho.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Pontos e carteira</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Resgate seguro</span>
            <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">Dashboard gerencial</span>
          </div>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]">
            Gerenciar fidelidade <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      <section className="surface-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Próximas mecânicas</p>
            <h2 className="mt-2 text-xl font-black text-gray-950">Mais formas de ativar e reter clientes</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-gray-500">
            Estes módulos já têm espaço reservado na arquitetura de Promoções e poderão ser adicionados sem aumentar o menu principal.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {FUTURE_MECHANICS.map((mechanic) => {
            const Icon = mechanic.icon;
            return (
              <article key={mechanic.title} className="rounded-2xl border border-[var(--line)] bg-[#fffdfa] p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[var(--brand)] shadow-sm">
                    <Icon size={18} />
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500">Planejado</span>
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
