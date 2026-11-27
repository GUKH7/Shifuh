import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

assert.equal(process.env.IFOOD_MERCHANT_UNIQUENESS_E2E, "1");
const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Supabase local obrigatório");
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
const db = createClient(url.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = ["11111111-1111-4111-8111-111111111111", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];
const merchant = randomUUID();
const before = await db.from("ifood_integrations").select("id").in("restaurant_id", ids);
assert.ifError(before.error);
assert.equal(before.data.length, 0, "Não sobrescrever fixtures de integração");
try {
  const writes = await Promise.all(ids.map((restaurant_id, i) => db.from("ifood_integrations")
    .insert({ restaurant_id, merchant_id: i ? merchant.toUpperCase() : merchant, order_sync_enabled: false })
    .select("id").single()));
  assert.equal(writes.filter(r => !r.error).length, 1);
  assert.equal(writes.filter(r => r.error?.code === "23505").length, 1);
  const winner = ids[writes.findIndex(r => !r.error)];
  const loser = ids.find(id => id !== winner);
  const rejected = await db.from("ifood_integrations").insert({ restaurant_id: loser, merchant_id: merchant, order_sync_enabled: true });
  assert.equal(rejected.error?.code, "23505");
  const unique = await db.from("ifood_integrations").insert({ restaurant_id: loser, merchant_id: randomUUID(), order_sync_enabled: true });
  assert.ifError(unique.error);
  const update = await db.from("ifood_integrations").update({ merchant_id: merchant }).eq("restaurant_id", loser);
  assert.equal(update.error?.code, "23505");
  const rows = await db.from("ifood_integrations").select("merchant_id, restaurant_id").in("restaurant_id", ids);
  assert.ifError(rows.error);
  assert.equal(new Set(rows.data.map(row => row.merchant_id.toLowerCase())).size, 2);
  // Exercise the direct settings save path with a real tenant JWT and RLS.
  // The seeded owner controls ids[0] only, regardless of which claim won.
  assert.ok(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  assert.ok(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);
  const tenant = createClient(url.toString(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await tenant.auth.signInWithPassword({
    email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD,
  });
  assert.ifError(login.error);
  const visible = await tenant.from("ifood_integrations")
    .select("restaurant_id, merchant_id").in("restaurant_id", ids);
  assert.ifError(visible.error);
  assert.deepEqual(visible.data.map(row => row.restaurant_id), [ids[0]]);
  const foreignMerchant = rows.data.find(row => row.restaurant_id === ids[1]).merchant_id;
  const ownMerchant = rows.data.find(row => row.restaurant_id === ids[0]).merchant_id;
  const duplicate = await tenant.from("ifood_integrations")
    .update({ merchant_id: foreignMerchant.toUpperCase() })
    .eq("restaurant_id", ids[0]);
  assert.equal(duplicate.error?.code, "23505", "Direct authenticated settings write cannot claim another merchant");
  const forbidden = await tenant.from("ifood_integrations")
    .update({ merchant_id: randomUUID() }).eq("restaurant_id", ids[1]).select("id");
  assert.ok(forbidden.error || forbidden.data.length === 0, "Foreign tenant write must not succeed");
  const after = await db.from("ifood_integrations").select("restaurant_id, merchant_id").in("restaurant_id", ids);
  assert.ifError(after.error);
  assert.equal(after.data.find(row => row.restaurant_id === ids[0]).merchant_id, ownMerchant);
  assert.equal(after.data.find(row => row.restaurant_id === ids[1]).merchant_id, foreignMerchant);
  console.log("Merchant exclusivity: concurrent claim, case normalization, authenticated direct writes and tenant RLS verified on local Postgres.");
} finally {
  const cleanup = await db.from("ifood_integrations").delete().in("restaurant_id", ids);
  assert.ifError(cleanup.error);
}
