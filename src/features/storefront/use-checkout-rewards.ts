"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBestCheckoutReward,
  getRewardDiscount,
  getRewardEligibility,
  type CheckoutReward,
} from "@/features/storefront/checkout-rewards";
import type { FulfillmentType } from "@/features/storefront/types";

type UseCheckoutRewardsArgs = {
  restaurantId?: string;
  isCheckoutOpen: boolean;
  subtotal: number;
  deliveryFee: number;
  fulfillmentType: FulfillmentType;
  hasCoupon: boolean;
};

export function useCheckoutRewards({
  restaurantId,
  isCheckoutOpen,
  subtotal,
  deliveryFee,
  fulfillmentType,
  hasCoupon,
}: UseCheckoutRewardsArgs) {
  const [rewards, setRewards] = useState<CheckoutReward[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [optedOut, setOptedOut] = useState(false);

  const refresh = useCallback(async () => {
    if (!restaurantId) {
      setRewards([]);
      setSelectedRewardId(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/customer/rewards", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seus prêmios.");

      const nextRewards = (Array.isArray(payload.rewards) ? payload.rewards : [])
        .filter((reward: CheckoutReward) => reward.restaurant?.id === restaurantId)
        .filter((reward: CheckoutReward) => reward.status === "available");
      setRewards(nextRewards);
    } catch (cause) {
      console.error(cause);
      setRewards([]);
      setSelectedRewardId(null);
      setError("Não foi possível conferir seus prêmios agora.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!isCheckoutOpen) return;
    void refresh();
  }, [isCheckoutOpen, refresh]);

  const eligibleRewards = useMemo(
    () => rewards.filter((reward) => getRewardEligibility(reward, subtotal, deliveryFee, fulfillmentType).eligible),
    [deliveryFee, fulfillmentType, rewards, subtotal],
  );

  const bestReward = useMemo(
    () => getBestCheckoutReward(rewards, subtotal, deliveryFee, fulfillmentType),
    [deliveryFee, fulfillmentType, rewards, subtotal],
  );

  useEffect(() => {
    if (hasCoupon) {
      setSelectedRewardId(null);
      return;
    }
    if (optedOut) return;

    const currentStillEligible = selectedRewardId
      ? eligibleRewards.some((reward) => reward.id === selectedRewardId)
      : false;
    if (currentStillEligible) return;

    setSelectedRewardId(bestReward?.id || null);
  }, [bestReward, eligibleRewards, hasCoupon, optedOut, selectedRewardId]);

  const selectedReward = useMemo(
    () => rewards.find((reward) => reward.id === selectedRewardId) || null,
    [rewards, selectedRewardId],
  );

  const discountAmount = useMemo(
    () => getRewardDiscount(selectedReward, subtotal, deliveryFee, fulfillmentType),
    [deliveryFee, fulfillmentType, selectedReward, subtotal],
  );

  const selectReward = useCallback((rewardId: string) => {
    setOptedOut(false);
    setSelectedRewardId(rewardId);
  }, []);

  const skipRewards = useCallback(() => {
    setOptedOut(true);
    setSelectedRewardId(null);
  }, []);

  const enableAutomaticReward = useCallback(() => {
    setOptedOut(false);
  }, []);

  const consumeSelectedRewardLocally = useCallback(() => {
    if (!selectedRewardId) return;
    setRewards((current) => current.filter((reward) => reward.id !== selectedRewardId));
    setSelectedRewardId(null);
    setOptedOut(false);
  }, [selectedRewardId]);

  return {
    rewards,
    eligibleRewards,
    selectedReward,
    selectedRewardId,
    discountAmount,
    loading,
    error,
    optedOut,
    refresh,
    selectReward,
    skipRewards,
    enableAutomaticReward,
    consumeSelectedRewardLocally,
  };
}
