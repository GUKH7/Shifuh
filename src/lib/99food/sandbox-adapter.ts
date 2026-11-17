import {
  normalizeMarketplaceOrderEvent,
  normalizeMarketplaceEventBatch,
  type MarketplaceOrderEnvelope,
  type MarketplaceOrderEvent,
  type MarketplaceOrderStatus,
} from "../marketplaces/order-envelope";

/**
 * 99Food sandbox fixture adapter, NOT the official 99Food API contract.
 * Do not expose this module in an HTTP route or connect it to live credentials.
 * Synthetic fixture schema is intentionally distinguishable from production.
 */
export type Food99SandboxFixture = {
  fixtureVersion: "shifuh-99food-sandbox-v1";
  merchantId: string;
  orderId: string;
  eventId: string;
  state: "NEW" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
  happenedAt: string;
  displayId?: string;
};

export type Food99SandboxContext = {
  restaurantId: string;
  merchantId: string;
};

const stateMap: Record<Food99SandboxFixture["state"], MarketplaceOrderStatus> = {
  NEW: "pending",
  ACCEPTED: "preparing",
  OUT_FOR_DELIVERY: "delivering",
  COMPLETED: "done",
  CANCELLED: "canceled",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Strictly validate synthetic fixtures, including the merchant-to-restaurant
 * binding supplied by trusted server context, before normalization.
 */
export function adapt99FoodSandboxFixture(
  raw: unknown,
  context: Food99SandboxContext,
): MarketplaceOrderEvent {
  if (!isRecord(raw) || raw.fixtureVersion !== "shifuh-99food-sandbox-v1") {
    throw new Error("unsupported 99Food sandbox fixture");
  }
  // Prevent accidentally treating an unknown official API payload as a fixture.
  const allowed = new Set(["fixtureVersion", "merchantId", "orderId", "eventId", "state", "happenedAt", "displayId"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new Error("unknown 99Food sandbox fixture field");
  }
  if (typeof context?.merchantId !== "string" || !context.merchantId.trim() ||
      typeof context?.restaurantId !== "string" || !context.restaurantId.trim() ||
      raw.merchantId !== context.merchantId) {
    throw new Error("99Food merchant binding mismatch");
  }
  if (typeof raw.state !== "string" ||
      !Object.prototype.hasOwnProperty.call(stateMap, raw.state)) {
    throw new Error("unsupported 99Food sandbox state");
  }
  const envelope: MarketplaceOrderEnvelope = {
    channel: "99food",
    restaurantId: context.restaurantId,
    externalOrderId: raw.orderId as string,
    externalEventId: raw.eventId as string,
    status: stateMap[raw.state as Food99SandboxFixture["state"]],
    occurredAt: raw.happenedAt as string,
    ...(raw.displayId === undefined ? {} : { displayId: raw.displayId as string }),
  };
  return normalizeMarketplaceOrderEvent(envelope);
}

export function adapt99FoodSandboxBatch(
  fixtures: readonly unknown[],
  context: Food99SandboxContext,
) {
  if (!Array.isArray(fixtures) || fixtures.length > 500) {
    throw new Error("invalid 99Food sandbox batch");
  }
  return normalizeMarketplaceEventBatch(
    fixtures.map((fixture) => {
      const normalized = adapt99FoodSandboxFixture(fixture, context);
      const { channel, restaurantId, externalOrderId, externalEventId, status, occurredAt, displayId } = normalized;
      return { channel, restaurantId, externalOrderId, externalEventId, status, occurredAt, ...(displayId === undefined ? {} : { displayId }) };
    }),
  );
}
