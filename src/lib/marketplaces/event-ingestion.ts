import type { MarketplaceOrderEvent, MarketplaceOrderStatus } from "./order-envelope";
import { shouldApplyMarketplaceStatus } from "./order-envelope";

/**
 * Storage contract: applyAtomically MUST guarantee unique eventKey and orderKey
 * within a transaction (or an equivalent serialized operation). The result is
 * not an upstream ACK. No production database adapter is included in this PR.
 */
export type MarketplaceApplyResult = "created" | "updated" | "duplicate" | "stale";

export interface MarketplaceAtomicStore {
  applyAtomically(
    event: MarketplaceOrderEvent,
    canTransition: (current: MarketplaceOrderStatus | null, next: MarketplaceOrderStatus) => boolean,
  ): Promise<MarketplaceApplyResult>;
}

export type MarketplaceIngestSummary = {
  created: number;
  updated: number;
  duplicate: number;
  stale: number;
};

export async function ingestMarketplaceEvent(
  event: MarketplaceOrderEvent,
  store: MarketplaceAtomicStore,
): Promise<MarketplaceApplyResult> {
  // Never substitute two independent read/write operations here: racing
  // redeliveries need one atomic transaction for the entire decision.
  return store.applyAtomically(event, shouldApplyMarketplaceStatus);
}

export async function ingestMarketplaceEvents(
  events: readonly MarketplaceOrderEvent[],
  store: MarketplaceAtomicStore,
): Promise<MarketplaceIngestSummary> {
  const result: MarketplaceIngestSummary = {
    created: 0, updated: 0, duplicate: 0, stale: 0,
  };
  // Sequential dispatch per batch keeps fixture tests deterministic; atomic
  // storage is still mandatory across concurrently running workers/requests.
  for (const event of events) {
    const outcome = await ingestMarketplaceEvent(event, store);
    result[outcome] += 1;
  }
  return result;
}
