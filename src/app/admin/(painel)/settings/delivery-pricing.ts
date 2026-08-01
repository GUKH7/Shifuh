import type { DeliveryTier } from "./types";

export interface DeliveryTierGeneratorInput {
  pricePerKm: number;
  maxDistance: number;
  timeAtLimit: number;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const roundDistance = (value: number) => Math.round(value * 100) / 100;

export function generateDeliveryTiers({
  pricePerKm,
  maxDistance,
  timeAtLimit,
}: DeliveryTierGeneratorInput): DeliveryTier[] {
  const normalizedPrice = Math.max(0, Number.isFinite(pricePerKm) ? pricePerKm : 0);
  const normalizedDistance = Math.max(
    0.1,
    Number.isFinite(maxDistance) ? maxDistance : 0.1,
  );
  const normalizedTime = Math.max(0, Number.isFinite(timeAtLimit) ? timeAtLimit : 0);
  const wholeKilometers = Math.floor(normalizedDistance);
  const distances = Array.from({ length: wholeKilometers }, (_, index) => index + 1);
  const hasFractionalLimit = normalizedDistance - wholeKilometers > 0.001;

  if (hasFractionalLimit || distances.length === 0) {
    distances.push(normalizedDistance);
  }

  return distances.map((distance) => {
    const billedDistance = Math.max(1, Math.ceil(distance));
    const proportionalTime =
      normalizedTime === 0
        ? 0
        : Math.max(1, Math.ceil((normalizedTime * distance) / normalizedDistance));

    return {
      distance: roundDistance(distance),
      time: proportionalTime,
      price: roundCurrency(billedDistance * normalizedPrice),
    };
  });
}

export function normalizeDeliveryTiers(tiers: DeliveryTier[]): DeliveryTier[] {
  return tiers
    .map((tier) => ({
      distance: Math.max(0.1, Number(tier.distance) || 0.1),
      time: Math.max(0, Math.round(Number(tier.time) || 0)),
      price: roundCurrency(Math.max(0, Number(tier.price) || 0)),
    }))
    .sort((first, second) => first.distance - second.distance);
}
