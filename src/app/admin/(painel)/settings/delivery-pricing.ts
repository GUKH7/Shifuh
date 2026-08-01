import type { DeliveryTier } from "./types";

export interface DeliveryTierGeneratorInput {
  pricePerKm: number;
  maxDistance: number;
  initialTime: number;
  timeAtLimit: number;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const roundDistance = (value: number) => Math.round(value * 100) / 100;

export function generateDeliveryTiers({
  pricePerKm,
  maxDistance,
  initialTime,
  timeAtLimit,
}: DeliveryTierGeneratorInput): DeliveryTier[] {
  const normalizedPrice = Math.max(0, Number.isFinite(pricePerKm) ? pricePerKm : 0);
  const normalizedDistance = Math.max(
    0.1,
    Number.isFinite(maxDistance) ? maxDistance : 0.1,
  );
  const normalizedInitialTime = Math.max(
    0,
    Number.isFinite(initialTime) ? Math.round(initialTime) : 0,
  );
  const normalizedLimitTime = Math.max(
    normalizedInitialTime,
    Number.isFinite(timeAtLimit) ? Math.round(timeAtLimit) : normalizedInitialTime,
  );
  const wholeKilometers = Math.floor(normalizedDistance);
  const distances = Array.from({ length: wholeKilometers }, (_, index) => index + 1);
  const hasFractionalLimit = normalizedDistance - wholeKilometers > 0.001;

  if (hasFractionalLimit || distances.length === 0) {
    distances.push(normalizedDistance);
  }

  const firstDistance = distances[0];
  const timeRange = normalizedLimitTime - normalizedInitialTime;
  const distanceRange = normalizedDistance - firstDistance;

  return distances.map((distance) => {
    const billedDistance = Math.max(1, Math.ceil(distance));
    const progress = distanceRange <= 0 ? 1 : (distance - firstDistance) / distanceRange;
    const estimatedTime = Math.round(normalizedInitialTime + timeRange * progress);

    return {
      distance: roundDistance(distance),
      time: estimatedTime,
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
