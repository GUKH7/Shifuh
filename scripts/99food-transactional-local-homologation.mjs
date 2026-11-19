import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

/**
 * Run ONLY after CI starts disposable Supabase and seeds scripts/e2e-seed.mjs.
 * No real Supabase project is queried, and no provider endpoints are called.
 */
if (process.env.FOOD99_LOCAL_E2E !== "1") {
  throw new Error("99Food local homologation requires FOOD99_LOCAL_E2E=1");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) throw new Error("local Supabase credentials required");
const u = new URL(url);
if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.protocol !== "http:") {
  throw new Error("99Food homologation refuses non-local Supabase URLs");
}

const restaurantA = "11111111-1111-4111-8111-111111111111";
const restaurantB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const clients = Array.from({ length: 5 }, () => createClient(url, key, opts));
const db = clients[0];
const anon = createClient(url, anonKey, opts);
const stamp = "2026-11-19T12:00:00Z";

function requireNoError(result, scope) {
  if (result.error) throw new Error(`${scope}: ${result.error.message}`);
  return result.data;
}
function event(restaurantId, merchantId, orderId, eventId, status, occurredAt = stamp) {
  return {
    p_restaurant_id: restaurantId,
    p_merchant_id: merchantId,
    p_external_order_id: orderId,
    p_external_event_id: eventId,
    p_status: status,
    p_occurred_at: occurredAt,
  };
}
const invoke = (client, args) => client.rpc("ingest_99food_staged_event", args);

async function expectOutcome(args, expected) {
  const outcome = requireNoError(await invoke(db, args), `expected ${expected}`);
  assert.equal(outcome, expected);
}
async function expectReject(args, label, client = db) {
  const result = await invoke(client, args);
  assert.ok(result.error, `${label}: expected error`);
}

async function main() {
  const rows = [
    { restaurant_id: restaurantA, merchant_id: "99food-merchant-e2e-A", enabled: true },
    { restaurant_id: restaurantB, merchant_id: "99food-merchant-e2e-B", enabled: true },
  ];
  requireNoError(await db.from("marketplace_99food_merchants").insert(rows), "merchant seed");

  // Independent clients simulate concurrent workers sharing one database.
  const a = event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-1", "pending");
  const attempts = await Promise.all(
    Array.from({ length: 25 }, (_, i) => invoke(clients[i % clients.length], a))
  );
  const results = attempts.map((res) => requireNoError(res, "concurrent worker"));
  assert.equal(results.filter((v) => v === "created").length, 1);
  assert.equal(results.filter((v) => v === "duplicate").length, 24);

  // Other restaurant may use the SAME order/event IDs without collisions.
  const b = event(restaurantB, rows[1].merchant_id, "99food-order-1", "event-1", "pending");
  await expectOutcome(b, "created");

  // Merchant from restaurant B must never be allowed to write restaurant A.
  await expectReject(event(restaurantA, rows[1].merchant_id, "forged", "forged", "pending"), "cross-tenant write");
  await expectReject(event(restaurantA, "unknown-merchant", "unknown", "unknown", "pending"), "unknown merchant");
  await expectReject(event(restaurantA, rows[0].merchant_id, "another-order", "event-1", "pending"), "reused event ID");
  await expectReject(event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-1", "done"), "conflicting redelivery");
  await expectReject(event(restaurantA, rows[0].merchant_id, "99food-order-1", "invalid", "unknown"), "invalid status");

  await expectOutcome(event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-2", "preparing", "2026-11-19T12:01:00Z"), "updated");
  await expectOutcome(event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-late", "pending", "2026-11-19T12:00:30Z"), "stale");
  await expectOutcome(event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-done", "done", "2026-11-19T12:10:00Z"), "updated");
  await expectOutcome(event(restaurantA, rows[0].merchant_id, "99food-order-1", "event-reopen", "preparing", "2026-11-19T12:11:00Z"), "stale");

  // Disabled merchants fail even when delivering a previously seen event.
  requireNoError(await db.from("marketplace_99food_merchants")
    .update({ enabled: false }).eq("merchant_id", rows[0].merchant_id), "disable merchant");
  await expectReject(a, "disabled merchant");
  requireNoError(await db.from("marketplace_99food_merchants")
    .update({ enabled: true }).eq("merchant_id", rows[0].merchant_id), "enable merchant");

  // Anonymous REST role has no access to the privileged RPC or staging tables.
  await expectReject(a, "anonymous RPC", anon);
  const anonQuery = await anon.from("marketplace_99food_events").select("external_event_id");
  assert.ok(anonQuery.error || (anonQuery.data || []).length === 0, "no anonymous access");

  const ordersA = requireNoError(
    await db.from("marketplace_99food_orders").select("status").eq("restaurant_id", restaurantA)
      .eq("external_order_id", "99food-order-1"), "order state");
  assert.equal(ordersA.length, 1);
  assert.equal(ordersA[0].status, "done");
  const eventsA = requireNoError(
    await db.from("marketplace_99food_events").select("external_event_id")
      .eq("restaurant_id", restaurantA), "event ledger A");
  const eventsB = requireNoError(
    await db.from("marketplace_99food_events").select("external_event_id")
      .eq("restaurant_id", restaurantB), "event ledger B");
  assert.equal(eventsA.length, 5);
  assert.equal(eventsB.length, 1);
  console.log("99Food local-only transactional homologation: PASS (25 races, tenants, auth, replay, chronology).");
}
await main();
