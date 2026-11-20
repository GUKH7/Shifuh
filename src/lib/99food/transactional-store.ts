import {
  normalizeMarketplaceOrderEvent,
  type MarketplaceOrderEvent,
} from "../marketplaces/order-envelope";
import type {
  MarketplaceApplyResult,
  MarketplaceAtomicStore,
} from "../marketplaces/event-ingestion";

/**
 * A private, sandbox-only PostgREST RPC boundary. The official 99Food payload,
 * provider authentication and authorization are NOT implemented here.
 * This module must never be wired to a public HTTP endpoint as-is.
 */
export type Food99StagedMerchantBinding = Readonly<{
  restaurantId: string;
  merchantId: string;
}>;

export type Food99StagedRpcArgs = {
  p_restaurant_id: string;
  p_merchant_id: string;
  p_external_order_id: string;
  p_external_event_id: string;
  p_status: MarketplaceOrderEvent["status"];
  p_occurred_at: string;
};

export type Food99StagedRpc = (
  functionName: "ingest_99food_staged_event",
  args: Food99StagedRpcArgs,
) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

const outcomes = new Set<MarketplaceApplyResult>([
  "created", "updated", "duplicate", "stale",
]);

/**
 * The application must resolve the merchant binding from trusted server-side
 * configuration. The PostgreSQL RPC independently rechecks that binding and
 * commits state and dedupe ledger atomically. No upstream provider ACK occurs.
 */
export function create99FoodLocalTransactionalStore(
  rpc: Food99StagedRpc,
  binding: Food99StagedMerchantBinding,
): MarketplaceAtomicStore {
  if (typeof rpc !== "function") throw new Error("99Food RPC is required");
  if (
    typeof binding?.restaurantId !== "string" || !binding.restaurantId.trim() ||
    typeof binding?.merchantId !== "string" || !binding.merchantId.trim() ||
    binding.merchantId.length > 160
  ) {
    throw new Error("trusted 99Food merchant binding is required");
  }
  const trustedRestaurantId = binding.restaurantId.trim();
  const trustedMerchantId = binding.merchantId.trim();

  return {
    async applyAtomically(event): Promise<MarketplaceApplyResult> {
      // Check the caller did not forge the normalized channel or tenant keys.
      const validated = normalizeMarketplaceOrderEvent(event);
      if (validated.channel !== "99food" ||
          validated.restaurantId !== trustedRestaurantId ||
          validated.orderKey !== event.orderKey ||
          validated.eventKey !== event.eventKey) {
        throw new Error("99Food staged event scope mismatch");
      }

      const { data, error } = await rpc("ingest_99food_staged_event", {
        p_restaurant_id: trustedRestaurantId,
        p_merchant_id: trustedMerchantId,
        p_external_order_id: validated.externalOrderId,
        p_external_event_id: validated.externalEventId,
        p_status: validated.status,
        p_occurred_at: validated.occurredAt,
      });
      if (error) throw new Error(`99Food staged persistence failed: ${error.message}`);
      if (typeof data !== "string" || !outcomes.has(data as MarketplaceApplyResult)) {
        throw new Error("invalid 99Food staged persistence outcome");
      }
      return data as MarketplaceApplyResult;
    },
  };
}
