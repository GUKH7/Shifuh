import type { FulfillmentType } from "@/features/storefront/types";

export type CheckoutReward = {
  id: string;
  type: "percent" | "fixed" | "free_shipping" | "free_product";
  label: string;
  percentageValue: number | null;
  fixedAmount: number | null;
  minimumOrderAmount: number;
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  productAvailable: boolean;
  status: "available" | "redeemed" | "expired" | "cancelled";
  expiresAt: string | null;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    primaryColor: string;
  } | null;
};

export type RewardEligibility = {
  eligible: boolean;
  reason: string;
  missingAmount: number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function getRewardEligibility(
  reward: CheckoutReward,
  subtotal: number,
  deliveryFee: number,
  fulfillmentType: FulfillmentType,
  referenceTimeMs = Date.now(),
): RewardEligibility {
  if (reward.status !== "available") {
    return {
      eligible: false,
      reason: reward.status === "expired" ? "Prêmio expirado" : "Prêmio indisponível",
      missingAmount: 0,
    };
  }

  if (reward.expiresAt) {
    const expiresAt = new Date(reward.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= referenceTimeMs) {
      return { eligible: false, reason: "Prêmio expirado", missingAmount: 0 };
    }
  }

  const minimumOrder = Math.max(0, Number(reward.minimumOrderAmount) || 0);
  if (subtotal < minimumOrder) {
    return {
      eligible: false,
      reason: "Pedido mínimo ainda não atingido",
      missingAmount: roundMoney(minimumOrder - subtotal),
    };
  }

  if (reward.type === "free_shipping" && (fulfillmentType !== "delivery" || deliveryFee <= 0)) {
    return {
      eligible: false,
      reason: fulfillmentType === "pickup" ? "Válido apenas para entrega" : "Válido quando houver taxa de entrega",
      missingAmount: 0,
    };
  }

  if (reward.type === "free_product" && (!reward.productId || !reward.productAvailable)) {
    return { eligible: false, reason: "Produto temporariamente indisponível", missingAmount: 0 };
  }

  if (reward.type === "percent" && Number(reward.percentageValue || 0) <= 0) {
    return { eligible: false, reason: "Prêmio indisponível", missingAmount: 0 };
  }

  if (reward.type === "fixed" && Number(reward.fixedAmount || 0) <= 0) {
    return { eligible: false, reason: "Prêmio indisponível", missingAmount: 0 };
  }

  return { eligible: true, reason: "Disponível neste pedido", missingAmount: 0 };
}

export function getRewardDiscount(
  reward: CheckoutReward | null,
  subtotal: number,
  deliveryFee: number,
  fulfillmentType: FulfillmentType,
  referenceTimeMs = Date.now(),
) {
  if (!reward || !getRewardEligibility(reward, subtotal, deliveryFee, fulfillmentType, referenceTimeMs).eligible) return 0;

  if (reward.type === "percent") {
    return Math.min(roundMoney(subtotal * (Number(reward.percentageValue || 0) / 100)), subtotal);
  }
  if (reward.type === "fixed") {
    return Math.min(roundMoney(Number(reward.fixedAmount || 0)), subtotal);
  }
  if (reward.type === "free_shipping") {
    return fulfillmentType === "delivery" ? roundMoney(deliveryFee) : 0;
  }
  return 0;
}

export function getRewardEstimatedValue(
  reward: CheckoutReward,
  subtotal: number,
  deliveryFee: number,
  fulfillmentType: FulfillmentType,
  referenceTimeMs = Date.now(),
) {
  if (!getRewardEligibility(reward, subtotal, deliveryFee, fulfillmentType, referenceTimeMs).eligible) return -1;
  if (reward.type === "free_product") return Math.max(0, Number(reward.productPrice) || 0);
  return getRewardDiscount(reward, subtotal, deliveryFee, fulfillmentType, referenceTimeMs);
}

export function getBestCheckoutReward(
  rewards: CheckoutReward[],
  subtotal: number,
  deliveryFee: number,
  fulfillmentType: FulfillmentType,
  referenceTimeMs = Date.now(),
) {
  return rewards
    .filter((reward) => getRewardEligibility(reward, subtotal, deliveryFee, fulfillmentType, referenceTimeMs).eligible)
    .sort((left, right) => (
      getRewardEstimatedValue(right, subtotal, deliveryFee, fulfillmentType, referenceTimeMs)
      - getRewardEstimatedValue(left, subtotal, deliveryFee, fulfillmentType, referenceTimeMs)
    ))[0] || null;
}
