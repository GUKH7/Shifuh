"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CircleDollarSign,
  Coins,
  Gift,
  Loader2,
  RefreshCcw,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import { AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

type LoyaltyStatus = "draft" | "active" | "paused";
type TrendBucket = "day" | "week" | "month";

type LoyaltyMetricsPayload = {
  program: null | {
    id: string;
    name: string;
    status: LoyaltyStatus;
  };
  period: {
    days: number;
    start: string | null;
    bucket: TrendBucket;
    trendStart: string | null;
  };
  metrics: {
    participants: number;
    newParticipants: number;
    customersWithBalance: number;
    pointsInCirculation: number;
    pointsIssuedPeriod: number;
    pointsRedeemedPeriod: number;
    pointsExpiredPeriod: number;
    pointsIssuedAllTime: number;
    pointsRedeemedAllTime: number;
    pointsExpiredAllTime: number;
    redemptionRatePct: number;
    rewardsIssuedPeriod: number;
    rewardsUsedPeriod: number;
    rewardsAvailable: number;
    earningOrdersPeriod: number;
    earningOrdersRevenue: number;
    redemptionOrdersPeriod: number;
    redemptionOrdersRevenue: number;
  };
  trend: Array<{
    period: string;
    earned: number;
    redeemed: number;
  }>;
  rewards: Array<{
    id: string;
    name: string;
    type: "percent" | "fixed" | "free_shipping" | "free_product";
    pointsCost: number;
    active: boolean;
    totalRedemptions: number;
    periodRedemptions: number;
    totalUsed: number;
    periodUsed: number;
    pointsSpent: number;
  }>;
  topCustomers: Array<{
    customerId: string;
    phone: string | null;
    balance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
  }>;
};

const PERIOD_OPTIONS = [
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 180, label: "180 dias" },
  { value: 365, label: "1 ano" },
  { value: 0, label: "Todo o período" },
];

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatPercent(value: number | null | undefined) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatPhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return "Cliente sem telefone";
}

function statusLabel(status: LoyaltyStatus) {
  if (status === "active") return "Ativo";
  if (status === "paused") return "Pausado";
  return "Rascunho";
}

function statusClass(status: LoyaltyStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-700";
  if (status === "paused") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function rewardTypeLabel(type: LoyaltyMetricsPayload["rewards"][number]["type"]) {
  if (type === "percent") return "Desconto percentual";
  if (type === "fixed") return "Desconto em valor";
  if (type === "free_shipping") return "Frete grátis";
  return "Produto grátis";
}

function trendLabel(value: string, bucket: TrendBucket) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  if (bucket === "month") {
    return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

export default function LoyaltyManagementDashboard() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [restaurantId, setRestaurantId] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<LoyaltyMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadMetrics = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      let currentRestaurantId = restaurantId;
      if (!currentRestaurantId) {
        const { restaurant, user } = await getCurrentRestaurant(supabase);
        if (!user) {
          router.push("/admin/login");
          return;
        }
        if (!restaurant) {
          setError("Não foi possível localizar a loja.");
          return;
        }
        currentRestaurantId = restaurant.id;
        setRestaurantId(restaurant.id);
      }

      const { data: metricsData, error: metricsError } = await (supabase as any).rpc(
        "get_loyalty_management_metrics",
        {
          p_restaurant_id: currentRestaurantId,
          p_period_days: periodDays,
        },
      );

      if (metricsError) throw metricsError;
      setData(metricsData as LoyaltyMetricsPayload);
    } catch (loadError) {
      console.error(loadError);
      setError("Erro ao carregar os indicadores da fidelidade.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodDays, restaurantId, router, supabase]);

  useEffect(() => {
    void loadMetrics(false);
  }, [loadMetrics]);

  const visibleTrend = useMemo(() => (data?.trend || []).slice(-12), [data?.trend]);
  const trendMaximum = useMemo(
    () => Math.max(1, ...visibleTrend.flatMap((item) => [Number(item.earned || 0), Number(item.redeemed || 0)])),
    [visibleTrend],
  );
  const topRewards = useMemo(() => (data?.rewards || []).slice(0, 6), [data?.rewards]);

  if (loading) {
    return <AdminPageSkeleton ariaLabel="Carregando métricas da fidelidade" metrics={6} />;
  }

  if (error && !data) return <AdminErrorState description={error} />;

  const metrics = data?.metrics;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === periodDays)?.label || "Período";

  const mainMetrics = [
    {
      label: "Clientes participantes",
      value: formatNumber(metrics?.participants),
      helper: periodDays === 0
        ? `${formatNumber(metrics?.participants)} participantes no histórico`
        : `+${formatNumber(metrics?.newParticipants)} novo(s) em ${periodLabel.toLowerCase()}`,
      icon: Users,
    },
    {
      label: "Pontos em circulação",
      value: formatNumber(metrics?.pointsInCirculation),
      helper: `${formatNumber(metrics?.customersWithBalance)} cliente(s) com saldo positivo`,
      icon: WalletCards,
    },
    {
      label: "Pontos emitidos",
      value: formatNumber(metrics?.pointsIssuedPeriod),
      helper: `Créditos registrados em ${periodLabel.toLowerCase()}`,
      icon: ArrowUpRight,
    },
    {
      label: "Pontos resgatados",
      value: formatNumber(metrics?.pointsRedeemedPeriod),
      helper: `${formatNumber(metrics?.pointsExpiredPeriod)} ponto(s) expirado(s) no período`,
      icon: ArrowDownRight,
    },
    {
      label: "Taxa de resgate",
      value: formatPercent(metrics?.redemptionRatePct),
      helper: "Pontos resgatados ÷ pontos emitidos no histórico",
      icon: Activity,
    },
    {
      label: "Benefícios utilizados",
      value: formatNumber(metrics?.rewardsUsedPeriod),
      helper: `${formatNumber(metrics?.rewardsIssuedPeriod)} resgate(s) emitido(s) no período`,
      icon: Gift,
    },
  ];

  return (
    <AdminPageShell className="space-y-6 pb-6">
      <section className="surface-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
              <Sparkles size={21} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Gestão da fidelidade</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-gray-950">Desempenho do programa</h1>
                {data?.program ? (
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClass(data.program.status)}`}>
                    {statusLabel(data.program.status)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                {data?.program
                  ? `${data.program.name} · acompanhe clientes, pontos, resgates e recompensas com dados reais do ledger.`
                  : "Configure o programa abaixo para começar a acompanhar clientes, pontos e resgates."}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="min-w-40">
              <span className="sr-only">Período das métricas</span>
              <select
                value={periodDays}
                onChange={(event) => setPeriodDays(Number(event.target.value))}
                className="min-h-11 w-full rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-orange-100"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void loadMetrics(true)}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-black text-gray-700 transition hover:border-orange-200 hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
              Atualizar
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {error}
          </div>
        ) : null}

        {!data?.program ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[#fffdfa] px-5 py-8 text-center">
            <Award size={24} className="mx-auto text-gray-300" />
            <p className="mt-3 font-black text-gray-800">O dashboard será ativado após salvar o programa</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-gray-500">
              A configuração, o catálogo e o extrato continuam disponíveis logo abaixo para preparar a operação.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mainMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-2xl border border-orange-100 bg-[linear-gradient(145deg,#ffffff_0%,#fff8f3_100%)] p-5">
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
          </div>
        )}
      </section>

      {data?.program ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="surface-card rounded-3xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                  <ShoppingBag size={19} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Pedidos que pontuaram</p>
                  <h2 className="mt-1 text-xl font-black text-gray-950">{formatNumber(metrics?.earningOrdersPeriod)} pedido(s)</h2>
                </div>
              </div>
              <p className="mt-5 text-3xl font-black tracking-tight text-gray-950">{formatMoney(metrics?.earningOrdersRevenue)}</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Receita dos pedidos concluídos que originaram créditos automáticos de fidelidade no período selecionado.
              </p>
            </article>

            <article className="surface-card rounded-3xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                  <CircleDollarSign size={19} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Pedidos com benefício usado</p>
                  <h2 className="mt-1 text-xl font-black text-gray-950">{formatNumber(metrics?.redemptionOrdersPeriod)} pedido(s)</h2>
                </div>
              </div>
              <p className="mt-5 text-3xl font-black tracking-tight text-gray-950">{formatMoney(metrics?.redemptionOrdersRevenue)}</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Receita dos pedidos concluídos em que um benefício resgatado com pontos foi efetivamente utilizado.
              </p>
            </article>
          </section>

          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">
            <strong>Leitura de receita:</strong> estes valores representam pedidos vinculados à fidelidade. Eles não são atribuição causal de receita incremental gerada pelo programa.
          </div>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="surface-card rounded-3xl p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Evolução de pontos</p>
                  <h2 className="mt-2 text-xl font-black text-gray-950">Emissão × resgate</h2>
                </div>
                <div className="flex gap-4 text-xs font-bold text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Emitidos</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-900" /> Resgatados</span>
                </div>
              </div>

              {visibleTrend.length ? (
                <div className="mt-6 space-y-4">
                  {visibleTrend.map((item) => (
                    <div key={item.period} className="grid grid-cols-[52px_1fr] items-center gap-3">
                      <span className="text-xs font-bold text-gray-400">{trendLabel(item.period, data.period.bucket)}</span>
                      <div className="space-y-1.5">
                        <div className="flex min-h-4 items-center gap-2">
                          <div className="h-2.5 rounded-full bg-orange-500" style={{ width: `${Math.max(2, (Number(item.earned || 0) / trendMaximum) * 100)}%` }} />
                          <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatNumber(item.earned)}</span>
                        </div>
                        <div className="flex min-h-4 items-center gap-2">
                          <div className="h-2.5 rounded-full bg-gray-900" style={{ width: `${Math.max(2, (Number(item.redeemed || 0) / trendMaximum) * 100)}%` }} />
                          <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatNumber(item.redeemed)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] bg-[#fffdfa] px-5 py-8 text-center text-sm text-gray-500">
                  Ainda não há movimentações no período selecionado.
                </div>
              )}
              <p className="mt-5 text-xs text-gray-400">Exibindo até os 12 intervalos mais recentes do período.</p>
            </article>

            <article className="surface-card rounded-3xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                  <Trophy size={19} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Clientes engajados</p>
                  <h2 className="mt-1 text-xl font-black text-gray-950">Quem mais acumulou</h2>
                </div>
              </div>

              {data.topCustomers.length ? (
                <div className="mt-5 space-y-3">
                  {data.topCustomers.map((customer, index) => (
                    <div key={customer.customerId} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[#fffdfa] p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-[var(--brand)] shadow-sm">#{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-900">{formatPhone(customer.phone)}</p>
                          <p className="mt-1 text-xs text-gray-400">{formatNumber(customer.lifetimeEarned)} pts acumulados</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-gray-950">{formatNumber(customer.balance)} pts</p>
                        <p className="mt-1 text-[10px] text-gray-400">saldo atual</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-[#fffdfa] px-4 py-8 text-center text-sm text-gray-500">Nenhum cliente pontuou ainda.</p>
              )}
            </article>
          </section>

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">Performance das recompensas</p>
                <h2 className="mt-2 text-xl font-black text-gray-950">O que os clientes mais resgatam</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-500">
                <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{formatNumber(metrics?.rewardsAvailable)} benefício(s) disponível(is)</span>
                <span className="rounded-full bg-[#fcfaf7] px-3 py-1.5">{formatNumber(metrics?.pointsExpiredAllTime)} pts expirados no histórico</span>
              </div>
            </div>

            {topRewards.length ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                <div className="hidden grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.8fr] gap-4 border-b border-[var(--line)] bg-[#fcfaf7] px-4 py-3 text-xs font-black uppercase tracking-[0.06em] text-gray-400 md:grid">
                  <span>Recompensa</span>
                  <span>Resgates</span>
                  <span>Utilizados</span>
                  <span>Pontos usados</span>
                </div>
                {topRewards.map((reward) => (
                  <article key={reward.id} className="grid gap-3 border-b border-[var(--line)] p-4 last:border-b-0 md:grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.8fr] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-black text-gray-900">{reward.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${reward.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {reward.active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{rewardTypeLabel(reward.type)} · {formatNumber(reward.pointsCost)} pts</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 md:hidden">Resgates</p>
                      <p className="mt-1 font-black text-gray-900 md:mt-0">{formatNumber(reward.periodRedemptions)}</p>
                      <p className="text-[10px] text-gray-400">{formatNumber(reward.totalRedemptions)} no histórico</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 md:hidden">Utilizados</p>
                      <p className="mt-1 font-black text-gray-900 md:mt-0">{formatNumber(reward.periodUsed)}</p>
                      <p className="text-[10px] text-gray-400">{formatNumber(reward.totalUsed)} no histórico</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 md:hidden">Pontos usados</p>
                      <p className="mt-1 font-black text-gray-900 md:mt-0">{formatNumber(reward.pointsSpent)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-[#fffdfa] px-5 py-8 text-center">
                <Coins size={22} className="mx-auto text-gray-300" />
                <p className="mt-3 font-black text-gray-700">Nenhuma recompensa configurada</p>
                <p className="mt-1 text-sm text-gray-400">Use o catálogo abaixo para criar as primeiras opções de troca.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </AdminPageShell>
  );
}
