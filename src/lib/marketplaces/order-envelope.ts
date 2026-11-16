/**
 * Provider-neutral staging contract for marketplace orders.
 *
 * This module deliberately does NOT accept raw iFood/99Food API payloads.
 * Each official provider adapter must validate its API payload and explicitly
 * construct this internal envelope. No network, persistence or ACK side effects.
 */
export type MarketplaceChannel = "ifood" | "99food";
export type MarketplaceOrderStatus =
  | "pending"
  | "preparing"
  | "delivering"
  | "done"
  | "canceled";

export type MarketplaceOrderEnvelope = {
  channel: MarketplaceChannel;
  restaurantId: string;
  externalOrderId: string;
  externalEventId: string;
  status: MarketplaceOrderStatus;
  occurredAt: string;
  displayId?: string;
};

export type MarketplaceOrderEvent = MarketplaceOrderEnvelope & {
  /** Scoped to channel and restaurant to prevent cross-tenant collisions. */
  eventKey: string;
  orderKey: string;
};

const channels = new Set<string>(["ifood", "99food"]);
const statuses = new Set<string>([
  "pending", "preparing", "delivering", "done", "canceled",
]);
const MAX_ID_LENGTH = 160;
const MAX_BATCH_SIZE = 500;

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("occurredAt must be an ISO timestamp");
  }
  // Requiring a timezone prevents ambiguous ordering across marketplaces.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("occurredAt must include a timezone");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("occurredAt is invalid");
  return new Date(parsed).toISOString();
}

function encodeKey(parts: readonly string[]): string {
  // Length-prefixed components avoid collisions even when IDs contain ':'.
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

export function normalizeMarketplaceOrderEvent(input: MarketplaceOrderEnvelope): MarketplaceOrderEvent {
  if (!input || typeof input !== "object") throw new Error("order event is required");
  if (!channels.has(input.channel)) throw new Error("unsupported marketplace channel");
  if (!statuses.has(input.status)) throw new Error("unsupported order status");

  const restaurantId = requiredId(input.restaurantId, "restaurantId");
  const externalOrderId = requiredId(input.externalOrderId, "externalOrderId");
  const externalEventId = requiredId(input.externalEventId, "externalEventId");
  const occurredAt = timestamp(input.occurredAt);
  const displayId = input.displayId === undefined
    ? undefined
    : requiredId(input.displayId, "displayId");

  return {
    channel: input.channel,
    restaurantId,
    externalOrderId,
    externalEventId,
    status: input.status,
    occurredAt,
    ...(displayId === undefined ? {} : { displayId }),
    eventKey: encodeKey([input.channel, restaurantId, externalEventId]),
    orderKey: encodeKey([input.channel, restaurantId, externalOrderId]),
  };
}

export type MarketplaceEventBatch = {
  events: MarketplaceOrderEvent[];
  duplicates: number;
};

/** In-batch deduplication only. Durable idempotency belongs in the database layer. */
export function normalizeMarketplaceEventBatch(inputs: readonly MarketplaceOrderEnvelope[]): MarketplaceEventBatch {
  if (!Array.isArray(inputs) || inputs.length > MAX_BATCH_SIZE) {
    throw new Error("marketplace event batch is invalid or too large");
  }
  const seen = new Map<string, MarketplaceOrderEvent>();
  let duplicates = 0;
  for (const input of inputs) {
    const event = normalizeMarketplaceOrderEvent(input);
    const previous = seen.get(event.eventKey);
    if (previous) {
      // A provider reusing the same event ID with conflicting content is unsafe to ACK.
      if (previous.orderKey !== event.orderKey ||
          previous.status !== event.status ||
          previous.occurredAt !== event.occurredAt) {
        throw new Error("conflicting marketplace event ID");
      }
      duplicates++;
      continue;
    }
    seen.set(event.eventKey, event);
  }
  return { events: [...seen.values()], duplicates };
}

/**
 * Prevent a late non-terminal event from reopening a canceled/done order.
 * This is a staging helper, not a substitute for an atomic database guard.
 */
export function shouldApplyMarketplaceStatus(
  current: MarketplaceOrderStatus | null,
  incoming: MarketplaceOrderStatus,
): boolean {
  if (!statuses.has(incoming)) throw new Error("unsupported order status");
  if (current === null) return true;
  if (!statuses.has(current)) throw new Error("unsupported current order status");
  if (current === "done" || current === "canceled") return incoming === current;
  if (incoming === "canceled") return true;
  const rank: Record<Exclude<MarketplaceOrderStatus, "canceled">, number> = {
    pending: 0, preparing: 1, delivering: 2, done: 3,
  };
  return rank[incoming] >= rank[current];
}
