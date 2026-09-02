"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Gift, Loader2, Package, TicketPercent, Truck, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";

type RewardStatus = "available" | "redeemed" | "expired" | "cancelled";

type CustomerReward = {
  id: string;
  type: "percent" | "fixed" | "free_shipping" | "free_product";
  label: string;
  percentageValue: number | null;
  fixedAmount: number | null;
  productId: string | null;
  productName: string | null;
  status: RewardStatus;
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
  } | null;
};

const statusMeta: Record<RewardStatus, { label: string; className: string }> = {
  available: { label: "Disponível", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  redeemed: { label: "Utilizado", className: "border-blue-200 bg-blue-50 text-blue-700" },
  expired: { label: "Expirado", className: "border-gray-200 bg-gray-100 text-gray-500" },
  cancelled: { label: "Cancelado", className: "border-rose-200 bg-rose-50 text-rose-600" },
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function RewardIcon({ type }: { type: CustomerReward["type"] }) {
  if (type === "percent") return <TicketPercent size={22} />;
  if (type === "fixed") return <WalletCards size={22} />;
  if (type === "free_shipping") return <Truck size={22} />;
  return <Package size={22} />;
}

function rewardDetail(reward: CustomerReward) {
  if (reward.type === "percent" && reward.percentageValue != null) return `${reward.percentageValue}% de desconto`;
  if (reward.type === "fixed" && reward.fixedAmount != null) return `${formatMoney(reward.fixedAmount)} de desconto`;
  if (reward.type === "free_shipping") return "Frete grátis";
  if (reward.type === "free_product") return reward.productName ? `Produto grátis: ${reward.productName}` : "Produto grátis";
  return reward.label;
}

export default function MyRewardsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<CustomerReward[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/customer/rewards", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seus prêmios.");
        if (active) setRewards(Array.isArray(payload.rewards) ? payload.rewards : []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus prêmios.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const availableCount = useMemo(() => rewards.filter((reward) => reward.status === "available").length, [rewards]);
  const sortedRewards = useMemo(() => [...rewards].sort((a, b) => {
    if (a.status === "available" && b.status !== "available") return -1;
    if (b.status === "available" && a.status !== "available") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [rewards]);

  return (
    <main className="min-h-screen bg-[#f6f6f5] pb-16 text-gray-950">
      <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/92 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-600">Minha conta</p>
            <h1 className="truncate text-xl font-black sm:text-2xl">Meus prêmios</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-6 sm:pt-8">
        <section className="overflow-hidden rounded-[28px] bg-gray-950 p-6 text-white shadow-[0_18px_55px_rgba(17,24,39,0.16)] sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-orange-400">
                <Gift size={25} />
              </span>
              <h2 className="mt-5 text-2xl font-black sm:text-3xl">Suas recompensas em um só lugar</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
                Prêmios conquistados nas promoções das lojas ficam registrados aqui até serem utilizados ou expirarem.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/10 px-4 py-3 text-center">
              <strong className="block text-2xl font-black text-orange-400">{availableCount}</strong>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">disponíveis</span>
            </div>
          </div>
        </section>

        {loading && (
          <div className="mt-6 flex min-h-48 items-center justify-center rounded-2xl border border-gray-200 bg-white">
            <div className="text-center text-gray-500">
              <Loader2 className="mx-auto animate-spin text-orange-500" size={26} />
              <p className="mt-3 text-sm font-bold">Carregando seus prêmios...</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-[22px] border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error}</div>
        )}

        {!loading && !error && sortedRewards.length === 0 && (
          <section className="mt-6 rounded-[26px] border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500"><Gift size={26} /></span>
            <h2 className="mt-4 text-lg font-black">Nenhum prêmio por aqui ainda</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">Quando você ganhar uma recompensa em uma promoção do Shifuh, ela aparecerá automaticamente nesta página.</p>
          </section>
        )}

        {!loading && !error && sortedRewards.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">Carteira</p>
                <h2 className="mt-1 text-xl font-black">Seus prêmios</h2>
              </div>
              <span className="text-sm font-bold text-gray-400">{rewards.length} {rewards.length === 1 ? "prêmio" : "prêmios"}</span>
            </div>

            <div className="space-y-3">
              {sortedRewards.map((reward) => {
                const status = statusMeta[reward.status];
                const expires = formatDate(reward.expiresAt);
                const available = reward.status === "available";
                return (
                  <article key={reward.id} className={`rounded-2xl border bg-white p-5 shadow-[0_7px_24px_rgba(17,24,39,0.04)] ${available ? "border-orange-100" : "border-gray-200 opacity-75"}`}>
                    <div className="flex items-start gap-4">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${available ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-500"}`}>
                        <RewardIcon type={reward.type} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-gray-400">{reward.restaurant?.name || "Loja"}</p>
                            <h3 className="mt-1 text-lg font-black leading-tight text-gray-950">{reward.label}</h3>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}>{status.label}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-gray-600">{rewardDetail(reward)}</p>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                          {expires && (
                            <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> {available ? `Válido até ${expires}` : `Validade ${expires}`}</span>
                          )}
                          {reward.status === "redeemed" && reward.redeemedAt && (
                            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} /> Usado em {formatDate(reward.redeemedAt)}</span>
                          )}
                        </div>

                        {available && reward.restaurant?.slug && (
                          <button
                            type="button"
                            onClick={() => router.push(`/${reward.restaurant!.slug}`)}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-black text-gray-800 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                          >
                            Ir para a loja <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
