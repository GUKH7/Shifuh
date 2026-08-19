import type { DeliveryTier } from "./types";

export interface DeliveryTierGeneratorInput {
  pricePerKm: number;
  maxDistance: number;
  initialTime: number;
  timeAtLimit: number;
}

export interface DeliveryTierValidationResult {
  normalizedTiers: DeliveryTier[];
  duplicateDistances: number[];
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const roundDistance = (value: number) => Math.round(value * 100) / 100;
const distanceKey = (value: number) => roundDistance(value).toFixed(2);

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

export function serializeDeliveryTiers(tiers: DeliveryTier[]) {
  return JSON.stringify(normalizeDeliveryTiers(tiers));
}

export function validateDeliveryTiers(tiers: DeliveryTier[]): DeliveryTierValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (tiers.length === 0) {
    errors.push("Adicione pelo menos uma faixa de entrega.");
  }

  const invalidDistance = tiers.some(
    (tier) => !Number.isFinite(tier.distance) || Number(tier.distance) <= 0,
  );
  const invalidTime = tiers.some(
    (tier) => !Number.isFinite(tier.time) || Number(tier.time) < 0,
  );
  const invalidPrice = tiers.some(
    (tier) => !Number.isFinite(tier.price) || Number(tier.price) < 0,
  );

  if (invalidDistance) {
    errors.push("Todas as distâncias precisam ser maiores que zero.");
  }
  if (invalidTime) {
    errors.push("Os prazos não podem ser negativos.");
  }
  if (invalidPrice) {
    errors.push("Os valores de entrega não podem ser negativos.");
  }

  const distanceOccurrences = new Map<string, number>();
  tiers.forEach((tier) => {
    const key = distanceKey(Number(tier.distance));
    distanceOccurrences.set(key, (distanceOccurrences.get(key) ?? 0) + 1);
  });

  const duplicateDistances = Array.from(distanceOccurrences.entries())
    .filter(([, occurrences]) => occurrences > 1)
    .map(([key]) => Number(key));

  if (duplicateDistances.length > 0) {
    const formattedDistances = duplicateDistances
      .map((distance) => distance.toLocaleString("pt-BR"))
      .join(", ");
    errors.push(`Existem faixas repetidas em ${formattedDistances} km.`);
  }

  const normalizedTiers = normalizeDeliveryTiers(tiers);
  const hasDecreasingPrice = normalizedTiers.some(
    (tier, index) => index > 0 && tier.price < normalizedTiers[index - 1].price,
  );
  const hasDecreasingTime = normalizedTiers.some(
    (tier, index) => index > 0 && tier.time < normalizedTiers[index - 1].time,
  );

  if (hasDecreasingPrice) {
    warnings.push("Há uma faixa mais distante com valor menor que a anterior.");
  }
  if (hasDecreasingTime) {
    warnings.push("Há uma faixa mais distante com prazo menor que a anterior.");
  }

  return {
    normalizedTiers,
    duplicateDistances,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}
