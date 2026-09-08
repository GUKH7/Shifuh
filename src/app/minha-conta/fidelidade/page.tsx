"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gift,
  History,
  Loader2,
  Package,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  TicketPercent,
  Truck,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

type RewardType = "percent" | "fixed" | "free_shipping" | "free_product";
type TransactionType = "earn" | "redeem" | "expire" | "adjustment_credit" | "adjustment_debit";
type RedemptionStatus = "available" | "redeemed" | "expired" | "cancelled";

type LoyaltyReward = {
  id: string;
  name: string;
  description: string | null;
  type: RewardType;
  pointsCost: number;
  percentageValue: number | null;
  fixedAmount: number | null;
  productId: string | null;
  productName: string | null;
  minimumOrderAmount: number;
  rewardValidityDays: number | null;
  maxRedemptionsTotal: number | null;
  redemptionsTotal: number;
  remainingRedemptions: number | null;
  canRedeem: boolean;
};

type LoyaltyTransaction = {
  id: string;
  type: TransactionType;
  pointsDelta: number;
  balanceAfter: number;
  sourceOrderId: string | null;
  description: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type LoyaltyRedemption = {
  id: string;
  rewardId: string;
  type: RewardType;
  label: string;
  pointsSpent: number;
  balanceAfter: number;
  status: RedemptionStatus;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedOrderId: string | null;
  createdAt: string;
};

type LoyaltyProgram = {
  id: string;
  name: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
  } | null;
  account: {
    id: string | null;
    balance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    lifetimeExpired: number;
  };
  rewards: LoyaltyReward[];
  transactions: LoyaltyTransaction[];
  redemptions: LoyaltyRedemption[];
};

const redemptionStatus: Record<RedemptionStatus, { label: string; className: string }> = {
  available: { label: "Disponível", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  redeemed: { label: "Utilizado", className: "border-blue-200 bg-blue-50 text-blue-700" },
  expired: { label: "Expirado", className: "border-gray-200 bg-gray-100 text-gray-500" },
  cancelled: { label: "Cancelado", className: "border-rose-200 bg-rose-50 text-rose-600" },
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function RewardIcon({ type, size = 22 }: { type: RewardType; size?: number }) {
  if (type === "percent") return <TicketPercent size={size} />;
  if (type === "fixed") return <WalletCards size={size} />;
  if (type === "free_shipping") return <Truck size={size} />;
  return <Package size={size} />;
}

function rewardDetail(reward: LoyaltyReward) {
  if (reward.type === "percent" && reward.percentageValue != null) return `${reward.percentageValue}% de desconto`;
  if (reward.type === "fixed" && reward.fixedAmount != null) return `${formatMoney(reward.fixedAmount)} de desconto`;
  if (reward.type === "free_shipping") return "Frete grátis";
  if (reward.type === "free_product") return reward.productName ? `${reward.productName} grátis` : "Produto grátis";
  return reward.name;
}

function transactionLabel(transaction: LoyaltyTransaction) {
  if (transaction.type === "earn") return "Pontos recebidos";
  if (transaction.type === "redeem") return "Resgate de recompensa";
  if (transaction.type === "expire") return "Pontos expirados";
  if (transaction.type === "adjustment_credit") return "Ajuste de crédito";
  return "Ajuste de débito";
}

export default function LoyaltyCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sessionRequired, setSessionRequired] = useState(false);
  const [selectedReward, setSelectedReward] = useState<LoyaltyReward | null>(null);
  const [redeemKey, setRedeemKey] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadLoyalty = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/customer/loyalty", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSessionRequired(true);
        setPrograms([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar sua fidelidade.");

      const nextPrograms = Array.isArray(payload.programs) ? payload.programs : [];
      setSessionRequired(false);
      setPrograms(nextPrograms);
      setSelectedProgramId((current) => {
        if (current && nextPrograms.some((program: LoyaltyProgram) => program.id === current)) return current;
        return nextPrograms[0]?.id || null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar sua fidelidade.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLoyalty();
  }, [loadLoyalty]);

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) || programs[0] || null,
    [programs, selectedProgramId],
  );

  const progressReward = useMemo(() => {
    if (!selectedProgram) return null;
    const available = selectedProgram.rewards
      .filter((reward) => reward.remainingRedemptions == null || reward.remainingRedemptions > 0)
      .sort((a, b) => a.pointsCost - b.pointsCost);
    const locked = available.find((reward) => reward.pointsCost > selectedProgram.account.balance);
    return locked || available.find((reward) => reward.canRedeem) || available[0] || null;
  }, [selectedProgram]);

  const progressPercent = useMemo(() => {
    if (!selectedProgram || !progressReward || progressReward.pointsCost <= 0) return 0;
    return Math.min(100, Math.round((selectedProgram.account.balance / progressReward.pointsCost) * 100));
  }, [progressReward, selectedProgram]);

  const openRedeem = (reward: LoyaltyReward) => {
    if (!reward.canRedeem) return;
    setSelectedReward(reward);
    setRedeemKey(crypto.randomUUID());
    setRedeemError("");
  };

  const closeRedeem = () => {
    if (redeeming) return;
    setSelectedReward(null);
    setRedeemKey(null);
    setRedeemError("");
  };

  const redeem = async () => {
    if (!selectedReward || !redeemKey || redeeming) return;
    setRedeeming(true);
    setRedeemError("");

    try {
      const response = await fetch("/api/customer/loyalty/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": redeemKey,
        },
        body: JSON.stringify({ rewardId: selectedReward.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível concluir o resgate.");

      setSuccessMessage(`${selectedReward.name} foi resgatado. Seu benefício já está em Meus prêmios.`);
      setSelectedReward(null);
      setRedeemKey(null);
      await loadLoyalty();
    } catch (cause) {
      setRedeemError(cause instanceof Error ? cause.message : "Não foi possível concluir o resgate.");
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f6f5] px-4">
        <div className="text-center text-gray-500">
          <Loader2 className="mx-auto animate-spin text-orange-500" size={28} />
          <p className="mt-3 text-sm font-bold">Carregando sua fidelidade...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f6f5] pb-20 text-gray-950">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/92 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/minha-conta")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
              aria-label="Voltar para Minha conta"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-600">Minha conta</p>
              <h1 className="truncate text-xl font-black sm:text-2xl">Fidelidade</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/minha-conta/premios")}
            className="hidden min-h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:border-orange-200 hover:text-orange-700 sm:flex"
          >
            <Gift size={17} /> Meus prêmios
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-6 sm:pt-8">
        {sessionRequired && (
          <section className="rounded-3xl border border-orange-100 bg-white p-7 text-center shadow-[0_10px_35px_rgba(17,24,39,0.05)]">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><ShieldCheck size={28} /></span>
            <h2 className="mt-4 text-xl font-black">Confirme sua identidade para ver seus pontos</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
              Por segurança, saldo e resgates só aparecem quando sua conta está vinculada a um telefone confirmado.
            </p>
            <button
              type="button"
              onClick={() => router.push("/auth?returnUrl=/minha-conta/fidelidade")}
              className="mt-5 min-h-11 rounded-2xl bg-gray-950 px-5 text-sm font-black text-white transition hover:bg-gray-800"
            >
              Acessar minha conta
            </button>
          </section>
        )}

        {!sessionRequired && error && (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
            <p className="font-bold">{error}</p>
            <button type="button" onClick={() => { setLoading(true); loadLoyalty(); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black shadow-sm">
              <RotateCcw size={16} /> Tentar novamente
            </button>
          </section>
        )}

        {!sessionRequired && !error && programs.length === 0 && (
          <section className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500"><Star size={27} /></span>
            <h2 className="mt-4 text-xl font-black">Nenhum programa ativo por enquanto</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
              Quando uma loja em que você compra ativar o programa de fidelidade, seu saldo e recompensas aparecerão aqui.
            </p>
          </section>
        )}

        {!sessionRequired && !error && selectedProgram && (
          <>
            {programs.length > 1 && (
              <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                {programs.map((program) => (
                  <button
                    key={program.id}
                    type="button"
                    onClick={() => setSelectedProgramId(program.id)}
                    className={`min-h-11 shrink-0 rounded-2xl border px-4 text-sm font-black transition ${selectedProgram.id === program.id ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200"}`}
                  >
                    {program.restaurant?.name || program.name}
                  </button>
                ))}
              </div>
            )}

            <section className="overflow-hidden rounded-[28px] bg-gray-950 p-6 text-white shadow-[0_20px_60px_rgba(17,24,39,0.18)] sm:p-8">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white/55">{selectedProgram.restaurant?.name || "Programa de fidelidade"}</p>
                  <p className="mt-1 truncate text-lg font-black text-white/90">{selectedProgram.name}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <strong className="text-5xl font-black tracking-tight sm:text-6xl">{selectedProgram.account.balance}</strong>
                    <span className="pb-1.5 text-base font-bold text-white/50">pontos</span>
                  </div>
                </div>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-orange-400"><Sparkles size={28} /></span>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5">
                <div><p className="text-lg font-black">{selectedProgram.account.lifetimeEarned}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">ganhos</p></div>
                <div><p className="text-lg font-black">{selectedProgram.account.lifetimeRedeemed}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">usados</p></div>
                <div><p className="text-lg font-black">{selectedProgram.account.lifetimeExpired}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">expirados</p></div>
              </div>
            </section>

            {successMessage && (
              <section className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100"><Check size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Resgate concluído</p>
                  <p className="mt-1 text-sm leading-5 text-emerald-700">{successMessage}</p>
                  <button type="button" onClick={() => router.push("/minha-conta/premios")} className="mt-2 inline-flex items-center gap-1 text-sm font-black underline underline-offset-2">Ver meu prêmio <ArrowRight size={14} /></button>
                </div>
                <button type="button" onClick={() => setSuccessMessage("")} className="text-emerald-700" aria-label="Fechar aviso"><X size={18} /></button>
              </section>
            )}

            {progressReward && (
              <section className="mt-5 rounded-3xl border border-gray-200 bg-white p-5 shadow-[0_8px_28px_rgba(17,24,39,0.04)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-orange-600">Próxima conquista</p>
                    <h2 className="mt-1 text-lg font-black">{progressReward.canRedeem ? "Você já pode resgatar" : `Faltam ${Math.max(0, progressReward.pointsCost - selectedProgram.account.balance)} pontos`}</h2>
                    <p className="mt-1 text-sm text-gray-500">{progressReward.name} · {progressReward.pointsCost} pts</p>
                  </div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Zap size={20} /></span>
                </div>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs font-bold text-gray-400"><span>{selectedProgram.account.balance} pts</span><span>{progressReward.pointsCost} pts</span></div>
              </section>
            )}

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">Catálogo</p>
                  <h2 className="mt-1 text-xl font-black">Troque seus pontos</h2>
                </div>
                <span className="text-sm font-bold text-gray-400">{selectedProgram.rewards.length} {selectedProgram.rewards.length === 1 ? "recompensa" : "recompensas"}</span>
              </div>

              {selectedProgram.rewards.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Esta loja ainda não publicou recompensas para troca.</div>
              ) : (
                <div className="space-y-3">
                  {selectedProgram.rewards.map((reward) => {
                    const missing = Math.max(0, reward.pointsCost - selectedProgram.account.balance);
                    const exhausted = reward.remainingRedemptions === 0;
                    return (
                      <article key={reward.id} className={`rounded-3xl border bg-white p-5 shadow-[0_7px_24px_rgba(17,24,39,0.04)] ${reward.canRedeem ? "border-orange-200" : "border-gray-200"}`}>
                        <div className="flex items-start gap-4">
                          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${reward.canRedeem ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-500"}`}><RewardIcon type={reward.type} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-lg font-black leading-tight">{reward.name}</h3>
                                <p className="mt-1 text-sm font-bold text-gray-600">{rewardDetail(reward)}</p>
                              </div>
                              <span className="rounded-full bg-gray-950 px-3 py-1.5 text-xs font-black text-white">{reward.pointsCost} pts</span>
                            </div>

                            {reward.description && <p className="mt-3 text-sm leading-6 text-gray-500">{reward.description}</p>}

                            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-gray-500">
                              {reward.minimumOrderAmount > 0 && <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={14} /> Pedido mínimo {formatMoney(reward.minimumOrderAmount)}</span>}
                              {reward.rewardValidityDays && <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> {reward.rewardValidityDays} {reward.rewardValidityDays === 1 ? "dia" : "dias"} para usar após resgatar</span>}
                              {reward.remainingRedemptions != null && reward.remainingRedemptions > 0 && reward.remainingRedemptions <= 10 && <span className="font-bold text-orange-700">Restam {reward.remainingRedemptions}</span>}
                            </div>

                            <button
                              type="button"
                              disabled={!reward.canRedeem}
                              onClick={() => openRedeem(reward)}
                              className={`mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition ${reward.canRedeem ? "bg-orange-500 text-white hover:bg-orange-600" : "cursor-not-allowed bg-gray-100 text-gray-400"}`}
                            >
                              {reward.canRedeem ? <><Gift size={17} /> Resgatar recompensa</> : exhausted ? "Recompensa esgotada" : `Faltam ${missing} pts`}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-8">
              <div className="mb-3 px-1">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">Movimentações</p>
                <h2 className="mt-1 text-xl font-black">Histórico de pontos</h2>
              </div>

              {selectedProgram.transactions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center">
                  <History className="mx-auto text-gray-300" size={28} />
                  <p className="mt-3 text-sm font-bold text-gray-500">Seu extrato aparecerá aqui quando você começar a acumular pontos.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
                  {selectedProgram.transactions.map((transaction, index) => {
                    const credit = transaction.pointsDelta > 0;
                    return (
                      <div key={transaction.id} className={`flex items-center gap-3 p-4 sm:p-5 ${index > 0 ? "border-t border-gray-100" : ""}`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${credit ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-600"}`}>
                          {credit ? <Sparkles size={18} /> : <Clock3 size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{transaction.description || transactionLabel(transaction)}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{formatDate(transaction.createdAt, true)}{transaction.sourceOrderId ? ` · Pedido ${transaction.sourceOrderId.slice(0, 6)}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${credit ? "text-emerald-600" : "text-gray-700"}`}>{credit ? "+" : ""}{transaction.pointsDelta} pts</p>
                          <p className="mt-0.5 text-[10px] font-bold text-gray-400">saldo {transaction.balanceAfter}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">Resgates</p>
                  <h2 className="mt-1 text-xl font-black">Recompensas resgatadas</h2>
                </div>
                <button type="button" onClick={() => router.push("/minha-conta/premios")} className="inline-flex min-h-11 items-center gap-1 text-sm font-black text-orange-700">Meus prêmios <ChevronRight size={16} /></button>
              </div>

              {selectedProgram.redemptions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm font-bold text-gray-500">Você ainda não trocou pontos por recompensas.</div>
              ) : (
                <div className="space-y-3">
                  {selectedProgram.redemptions.map((redemption) => {
                    const status = redemptionStatus[redemption.status];
                    return (
                      <article key={redemption.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><RewardIcon type={redemption.type} size={18} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="font-black">{redemption.label}</h3>
                                <p className="mt-1 text-xs text-gray-400">Resgatado em {formatDate(redemption.createdAt, true)} · {redemption.pointsSpent} pts</p>
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${status.className}`}>{status.label}</span>
                            </div>
                            {redemption.expiresAt && redemption.status === "available" && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500"><CalendarClock size={13} /> Válido até {formatDate(redemption.expiresAt)}</p>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {selectedProgram.restaurant?.slug && (
              <button
                type="button"
                onClick={() => router.push(`/${selectedProgram.restaurant!.slug}`)}
                className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                Continuar comprando em {selectedProgram.restaurant.name} <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
      </div>

      {selectedReward && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="redeem-title">
          <div className="w-full max-w-md rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><RewardIcon type={selectedReward.type} /></span>
              <button type="button" onClick={closeRedeem} disabled={redeeming} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500" aria-label="Fechar"><X size={19} /></button>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-orange-600">Confirmar resgate</p>
            <h2 id="redeem-title" className="mt-1 text-2xl font-black">{selectedReward.name}</h2>
            <p className="mt-2 text-sm font-bold text-gray-600">{rewardDetail(selectedReward)}</p>
            <p className="mt-3 text-sm leading-6 text-gray-500">Ao confirmar, <strong className="text-gray-800">{selectedReward.pointsCost} pontos</strong> serão debitados do seu saldo e o benefício ficará disponível em Meus prêmios.</p>

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-gray-50 p-4">
              <span className="text-sm font-bold text-gray-500">Saldo após o resgate</span>
              <strong className="text-lg font-black">{Math.max(0, (selectedProgram?.account.balance || 0) - selectedReward.pointsCost)} pts</strong>
            </div>

            {redeemError && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{redeemError}</div>}

            <button
              type="button"
              onClick={redeem}
              disabled={redeeming}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redeeming ? <><Loader2 className="animate-spin" size={18} /> Concluindo...</> : <><Gift size={18} /> Confirmar por {selectedReward.pointsCost} pts</>}
            </button>
            <p className="mt-3 text-center text-[11px] leading-5 text-gray-400">Uma mesma tentativa é protegida contra débito duplicado, mesmo se a conexão oscilar.</p>
          </div>
        </div>
      )}
    </main>
  );
}
