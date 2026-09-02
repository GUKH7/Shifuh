"use client";

import Link from "next/link";
import { Check, Gift, Loader2, Sparkles } from "lucide-react";
import {
  getRewardEligibility,
  type CheckoutReward,
} from "@/features/storefront/checkout-rewards";
import type { FulfillmentType } from "@/features/storefront/types";
import { formatMoney } from "@/features/storefront/format";

type CheckoutRewardsCardProps = {
  rewards: CheckoutReward[];
  selectedReward: CheckoutReward | null;
  selectedRewardId: string | null;
  loading: boolean;
  error: string;
  optedOut: boolean;
  couponApplied: boolean;
  subtotal: number;
  deliveryFee: number;
  fulfillmentType: FulfillmentType;
  onSelectReward: (rewardId: string) => void;
  onSkipRewards: () => void;
  onEnableAutomaticReward: () => void;
};

function rewardBenefitLabel(reward: CheckoutReward) {
  if (reward.type === "percent") return `${Number(reward.percentageValue || 0)}% OFF`;
  if (reward.type === "fixed") return `${formatMoney(Number(reward.fixedAmount || 0))} OFF`;
  if (reward.type === "free_shipping") return "Frete grátis";
  if (reward.type === "free_product") return reward.productName ? `${reward.productName} grátis` : "Produto grátis";
  return reward.label;
}

function rewardRuleLabel(reward: CheckoutReward) {
  const rules: string[] = [];
  if (Number(reward.minimumOrderAmount || 0) > 0) {
    rules.push(`Pedido mínimo ${formatMoney(Number(reward.minimumOrderAmount))}`);
  }
  if (reward.expiresAt) {
    rules.push(`Válido até ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(reward.expiresAt))}`);
  }
  rules.push("Uso único");
  return rules.join(" · ");
}

export function CheckoutRewardsCard({
  rewards,
  selectedReward,
  selectedRewardId,
  loading,
  error,
  optedOut,
  couponApplied,
  subtotal,
  deliveryFee,
  fulfillmentType,
  onSelectReward,
  onSkipRewards,
  onEnableAutomaticReward,
}: CheckoutRewardsCardProps) {
  if (!loading && rewards.length === 0 && !error) return null;

  return (
    <section className="surface-card rounded-2xl p-4 sm:p-5" aria-labelledby="checkout-rewards-title">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          <Gift size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-orange-600">Recompensas</p>
              <h3 id="checkout-rewards-title" className="mt-0.5 text-base font-black text-gray-950">Seu prêmio no próximo pedido</h3>
            </div>
            <Link href="/minha-conta/premios" className="text-xs font-black text-orange-600">Meus prêmios</Link>
          </div>

          {loading && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Conferindo seus prêmios...
            </p>
          )}

          {!loading && error && <p role="alert" className="mt-3 text-sm font-bold text-rose-600">{error}</p>}

          {!loading && !error && couponApplied && rewards.length > 0 && (
            <div className="mt-3 rounded-2xl border border-gray-200 bg-[#faf8f5] px-3.5 py-3">
              <p className="text-sm font-black text-gray-900">Seu prêmio foi guardado</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">Como há um cupom aplicado, a recompensa fica disponível para outro pedido.</p>
            </div>
          )}

          {!loading && !error && !couponApplied && optedOut && rewards.length > 0 && (
            <div className="mt-3 rounded-2xl border border-gray-200 bg-[#faf8f5] px-3.5 py-3">
              <p className="text-sm font-black text-gray-900">Prêmio guardado para depois</p>
              <button type="button" onClick={onEnableAutomaticReward} className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-orange-600">
                <Sparkles size={14} /> Aplicar automaticamente
              </button>
            </div>
          )}

          {!loading && !error && !couponApplied && !optedOut && selectedReward && (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={14} strokeWidth={3} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-emerald-950">{rewardBenefitLabel(selectedReward)} aplicado automaticamente</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">{selectedReward.label}</p>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-emerald-700">{rewardRuleLabel(selectedReward)}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && !couponApplied && rewards.length > 0 && (
            <div className="mt-4 space-y-2">
              {rewards.map((reward) => {
                const eligibility = getRewardEligibility(reward, subtotal, deliveryFee, fulfillmentType);
                const selected = reward.id === selectedRewardId;
                return (
                  <button
                    key={reward.id}
                    type="button"
                    disabled={!eligibility.eligible}
                    onClick={() => onSelectReward(reward.id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
                      selected
                        ? "border-orange-300 bg-orange-50/60"
                        : eligibility.eligible
                          ? "border-gray-200 bg-white hover:border-orange-200"
                          : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-65"
                    }`}
                  >
                    <span className="min-w-0">
                      <strong className="block text-sm text-gray-950">{rewardBenefitLabel(reward)}</strong>
                      <span className="mt-1 block text-[11px] font-semibold leading-5 text-gray-500">
                        {eligibility.eligible
                          ? rewardRuleLabel(reward)
                          : eligibility.missingAmount > 0
                            ? `Faltam ${formatMoney(eligibility.missingAmount)} para liberar · ${rewardRuleLabel(reward)}`
                            : eligibility.reason}
                      </span>
                    </span>
                    {selected && <Check size={16} className="mt-0.5 shrink-0 text-orange-600" strokeWidth={3} />}
                  </button>
                );
              })}
              {selectedReward && (
                <button type="button" onClick={onSkipRewards} className="w-full py-2 text-xs font-bold text-gray-500">
                  Guardar o prêmio para outro pedido
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
