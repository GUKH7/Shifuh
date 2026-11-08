import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.MANUAL_CUSTOMER_LOCAL_E2E !== "1" || !url || !anonKey || !serviceKey ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("This validation requires isolated local Supabase");
}
const service = createClient(url, serviceKey, {auth:{persistSession:false, autoRefreshToken:false}});
const makeClient = () => createClient(url, anonKey, {auth:{persistSession:false, autoRefreshToken:false}});
const owner = makeClient();
const login = await owner.auth.signInWithPassword({
  email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD
});
assert.ifError(login.error);
assert.ok(login.data.user);
const rpc = (client, phone, name="Cliente Presencial Teste") =>
  client.rpc("register_manual_loyalty_customer",{p_name:name,p_phone:phone});
const restaurantId = "11111111-1111-4111-8111-111111111111";
const phone = "11995678432";

// Unauthenticated requests are forbidden.
const anonymous = await rpc(makeClient(), phone);
assert.ok(anonymous.error, "anonymous clients cannot create a customer");

// Invalid customer data must be rejected.
assert.ok((await rpc(owner, "1234")).error);
assert.ok((await rpc(owner, phone, "x")).error);

// Two concurrent submissions for the same phone must yield only one record.
const [first, second] = await Promise.all([
  rpc(owner, "(11) 99567-8432"),
  rpc(owner, "+55 11 99567-8432", "Outro Nome")
]);
assert.ifError(first.error);
assert.ifError(second.error);
const created = first.data?.[0];
const existing = second.data?.[0];
assert.ok(created?.customer_id);
assert.equal(created.customer_id, existing?.customer_id);
assert.ok([created.was_existing, existing.was_existing].filter(Boolean).length === 1,
  "exactly one request should reuse the customer");

// Repeat after completion to catch accidental duplicate or mutation of existing name.
const again = await rpc(owner, phone, "Nome Tentativa Sobrescrita");
assert.ifError(again.error);
assert.equal(again.data?.[0]?.customer_id, created.customer_id);
assert.equal(again.data?.[0]?.customer_name, created.customer_name);
assert.equal(again.data?.[0]?.was_existing, true);
const {data: actual, error: actualError} = await service.from("customers")
  .select("id,name,restaurant_id,phone").eq("restaurant_id", restaurantId).eq("phone", phone);
assert.ifError(actualError);
assert.equal(actual.length, 1);
assert.equal(actual[0].id, created.customer_id);
assert.equal(actual[0].name, created.customer_name);

// Creating a customer must not create a loyalty wallet or credit any points.
const [wallets, credits] = await Promise.all([
  service.from("loyalty_accounts").select("id").eq("customer_id", created.customer_id),
  service.from("loyalty_point_transactions").select("id").eq("customer_id", created.customer_id),
]);
assert.ifError(wallets.error);
assert.ifError(credits.error);
assert.equal(wallets.data.length, 0);
assert.equal(credits.data.length, 0);

// A logged-in user without ownership must also be forbidden.
const email = "nonowner-customer-register@shifuh.test";
const {data: createdUser, error: userError} = await service.auth.admin.createUser({
  email, password: "Local-E2E-Nonowner-2026!", email_confirm: true
});
assert.ifError(userError);
assert.ok(createdUser.user);
const other = makeClient();
const loginOther = await other.auth.signInWithPassword({ email, password:"Local-E2E-Nonowner-2026!" });
assert.ifError(loginOther.error);
const denied = await rpc(other, "11994443322", "Cliente sem Permissao");
assert.ok(denied.error, "authenticated users who are not the restaurant owner must be denied");
console.log("Manual customer registration local security and concurrency checks passed");
