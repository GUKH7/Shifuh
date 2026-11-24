import { adapt99FoodSandboxFixture, type Food99SandboxContext } from "./sandbox-adapter";
import { ingestMarketplaceEvent, type MarketplaceAtomicStore, type MarketplaceApplyResult } from "../marketplaces/event-ingestion";

/**
 * Internal-only test harness for a future verified 99Food ingress.
 *
 * The 99Food native webhook format, signature scheme and ACK contract are
 * currently unverified. This module deliberately exposes no HTTP route and
 * must not be connected to the real provider or production credentials.
 */
export type Food99SandboxVerification = Readonly<{
  verified: true;
  merchantId: string;
}>;

export type Food99SandboxVerifier = (request: Readonly<{
  rawBody: string;
  headers: Readonly<Record<string, string>>;
}>) => Promise<Food99SandboxVerification | null>;

export type Food99SandboxIngress = Readonly<{
  rawBody: string;
  headers: Readonly<Record<string, string>>;
  /** Trusted, server-resolved tenant/merchant relationship. */
  context: Food99SandboxContext;
}>;

const MAX_BODY_BYTES = 64 * 1024;

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 160 && value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * First authenticate raw bytes using a trusted verifier injected by local
 * tests. Only after authentication parse fixture data and persist atomically.
 * This result is an internal staging outcome, NEVER an upstream provider ACK.
 */
export async function ingestVerified99FoodSandboxEvent(
  ingress: Food99SandboxIngress,
  verify: Food99SandboxVerifier,
  store: MarketplaceAtomicStore,
): Promise<MarketplaceApplyResult> {
  if (typeof verify !== "function" || typeof store?.applyAtomically !== "function") {
    throw new Error("99Food verifier and transactional store are required");
  }
  if (!ingress || typeof ingress.rawBody !== "string" ||
      new TextEncoder().encode(ingress.rawBody).byteLength > MAX_BODY_BYTES ||
      !ingress.rawBody.length || !ingress.headers ||
      typeof ingress.headers !== "object" || Array.isArray(ingress.headers) ||
      !validIdentifier(ingress.context?.merchantId) ||
      !validIdentifier(ingress.context?.restaurantId)) {
    throw new Error("invalid 99Food sandbox ingress");
  }
  // Do not parse or mutate raw data before any future provider-specific
  // cryptographic verification. Never log credentials or raw payload.
  const authenticated = await verify({
    rawBody: ingress.rawBody,
    headers: ingress.headers,
  });
  if (authenticated?.verified !== true ||
      authenticated.merchantId !== ingress.context.merchantId) {
    throw new Error("99Food sandbox authentication failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(ingress.rawBody);
  } catch {
    throw new Error("invalid 99Food sandbox JSON");
  }
  const event = adapt99FoodSandboxFixture(parsed, ingress.context);
  return ingestMarketplaceEvent(event, store);
}
