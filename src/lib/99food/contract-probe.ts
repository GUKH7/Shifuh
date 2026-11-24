import {
  normalizeMarketplaceOrderEvent,
  type MarketplaceOrderEnvelope,
} from "../marketplaces/order-envelope";
import {
  ingestMarketplaceEvent,
  type MarketplaceApplyResult,
  type MarketplaceAtomicStore,
} from "../marketplaces/event-ingestion";

/**
 * A test-only seam for exercising future 99Food contract samples.
 *
 * The OFFICIAL 99Food authentication, event schema and ACK semantics are not
 * available to this module. It performs no network calls, exposes no route,
 * and must not be wired to real 99Food traffic or production credentials.
 */
export const FOOD99_CONTRACT_PROBE_VERSION = "shifuh-99food-contract-probe-v1";

export type Food99ProbeBinding = Readonly<{
  restaurantId: string;
  merchantId: string;
}>;

export type Food99ProbeRequest = Readonly<{
  rawBody: string;
  headers: Readonly<Record<string, string>>;
  /** Must come from a trusted test context, never untrusted message data. */
  binding: Food99ProbeBinding;
}>;

export type Food99ProbeVerification = Readonly<{
  source: typeof FOOD99_CONTRACT_PROBE_VERSION;
  merchantId: string;
}>;

export type Food99ContractProbe = Readonly<{
  /** Test mock: verify the original bytes BEFORE the JSON is decoded. */
  verifyRaw: (request: Readonly<{
    rawBody: string;
    headers: Readonly<Record<string, string>>;
  }>) => Promise<Food99ProbeVerification | null>;
  /** Test mock: map a previously verified synthetic message to our envelope. */
  decodeVerified: (
    rawBody: string,
    verified: Food99ProbeVerification,
  ) => Promise<MarketplaceOrderEnvelope>;
}>;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_HEADERS = 64;
const MAX_HEADER_BYTES = 8 * 1024;
const envelopeFields = new Set([
  "channel", "restaurantId", "externalOrderId", "externalEventId",
  "status", "occurredAt", "displayId",
]);

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 160 && value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Runs one authenticated contract probe through existing atomic persistence.
 * Return value is an INTERNAL staging outcome, never an upstream ACK.
 *
 * Do not use this seam with a production-facing adapter: an officially
 * documented verifier/decoder and a new, separately reviewed provider ingress
 * are required first.
 */
export async function probe99FoodContractEvent(
  request: Food99ProbeRequest,
  probe: Food99ContractProbe,
  store: MarketplaceAtomicStore,
): Promise<MarketplaceApplyResult> {
  if (typeof probe?.verifyRaw !== "function" ||
      typeof probe?.decodeVerified !== "function" ||
      typeof store?.applyAtomically !== "function") {
    throw new Error("99Food test probe and atomic store are required");
  }
  if (!request || !validIdentifier(request.binding?.restaurantId) ||
      !validIdentifier(request.binding?.merchantId) ||
      typeof request.rawBody !== "string" || request.rawBody.length === 0 ||
      new TextEncoder().encode(request.rawBody).byteLength > MAX_BODY_BYTES ||
      !request.headers || typeof request.headers !== "object" ||
      Array.isArray(request.headers)) {
    throw new Error("invalid 99Food contract probe request");
  }
  const headers = Object.entries(request.headers);
  if (headers.length > MAX_HEADERS ||
      headers.some(([name, value]) =>
        typeof value !== "string" || !name || name.length > 128 ||
        !/^[a-zA-Z0-9-]+$/.test(name) || /[\r\n]/.test(value)) ||
      headers.reduce((total, [name, value]) =>
        total + Buffer.byteLength(name) + Buffer.byteLength(value), 0) > MAX_HEADER_BYTES) {
    throw new Error("invalid 99Food contract probe headers");
  }

  // Verify *raw* bytes first; never parse unknown provider JSON here.
  const verified = await probe.verifyRaw({
    rawBody: request.rawBody,
    headers: request.headers,
  });
  if (verified?.source !== FOOD99_CONTRACT_PROBE_VERSION ||
      verified.merchantId !== request.binding.merchantId) {
    throw new Error("99Food contract probe authentication failed");
  }

  const mapped = await probe.decodeVerified(request.rawBody, verified);
  if (!mapped || typeof mapped !== "object" ||
      Object.keys(mapped).some(key => !envelopeFields.has(key))) {
    throw new Error("invalid 99Food contract probe envelope");
  }
  const normalized = normalizeMarketplaceOrderEvent(mapped);
  if (normalized.channel !== "99food" ||
      normalized.restaurantId !== request.binding.restaurantId) {
    throw new Error("99Food contract probe tenant/channel mismatch");
  }

  return ingestMarketplaceEvent(normalized, store);
}
