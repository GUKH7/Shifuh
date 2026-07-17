import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.MULTITENANT_TEST_ALLOW_PRODUCTION !== "true") {
  throw new Error("Defina MULTITENANT_TEST_ALLOW_PRODUCTION=true para executar o teste com limpeza.");
}

function readEnv(name) {
  return process.env[name]
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "")
    .trim();
}

const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Informe NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = randomUUID();
const password = `Tenant-check-${randomUUID()}!aA9`;
const createdUserIds = [];
const createdRestaurantIds = [];

function userClient() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTestUser(label) {
  const email = `tenant-check-${label}-${runId}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error("Usuario temporario nao criado.");
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function signIn(email) {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function insertOne(table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function expectHidden(client, table, restaurantId) {
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  assert.deepEqual(data, [], `${table} de outro restaurante ficou visivel`);
}

try {
  const [ownerA, ownerB] = await Promise.all([
    createTestUser("a"),
    createTestUser("b"),
  ]);

  const [restaurantA, restaurantB] = await Promise.all([
    insertOne("restaurants", {
      user_id: ownerA.id,
      name: "Tenant Check A",
      slug: `tenant-check-a-${runId}`,
      whatsapp_number: "551100000001",
    }),
    insertOne("restaurants", {
      user_id: ownerB.id,
      name: "Tenant Check B",
      slug: `tenant-check-b-${runId}`,
      whatsapp_number: "551100000002",
    }),
  ]);
  createdRestaurantIds.push(restaurantA.id, restaurantB.id);

  const customerB = await insertOne("customers", {
    restaurant_id: restaurantB.id,
    phone: "5511999999999",
    name: "Cliente B",
  });
  const couponB = await insertOne("coupons", {
    restaurant_id: restaurantB.id,
    code: `TENANT-${runId.slice(0, 8)}`,
    value: 5,
    discount_type: "fixed",
  });
  const integrationB = await insertOne("ifood_integrations", {
    restaurant_id: restaurantB.id,
    merchant_id: `merchant-${runId}`,
  });

  const { data: orderRows, error: orderError } = await admin.rpc(
    "create_order_transaction",
    {
      p_restaurant_id: restaurantB.id,
      p_customer_name: "Cliente Pedido B",
      p_customer_phone: "5511888888888",
      p_address: {},
      p_items: [{ product_name: "Produto B", quantity: 1, price: 10, addons: [] }],
      p_subtotal: 10,
      p_delivery_fee: 0,
      p_discount: 0,
      p_total: 10,
      p_payment_method: "pix",
      p_save_customer: false,
    },
  );
  if (orderError) throw orderError;
  const orderB = Array.isArray(orderRows) ? orderRows[0] : orderRows;
  assert.ok(orderB?.order_id, "Pedido temporario nao criado.");

  const [clientA, clientB] = await Promise.all([
    signIn(ownerA.email),
    signIn(ownerB.email),
  ]);

  const { data: ownRestaurant, error: ownError } = await clientA
    .from("restaurants")
    .select("id")
    .eq("id", restaurantA.id)
    .single();
  if (ownError) throw ownError;
  assert.equal(ownRestaurant.id, restaurantA.id);

  const { data: foreignRestaurant, error: foreignRestaurantError } = await clientA
    .from("restaurants")
    .select("id")
    .eq("id", restaurantB.id);
  if (foreignRestaurantError) throw foreignRestaurantError;
  assert.deepEqual(foreignRestaurant, []);

  await expectHidden(clientA, "customers", restaurantB.id);
  await expectHidden(clientA, "coupons", restaurantB.id);
  await expectHidden(clientA, "ifood_integrations", restaurantB.id);
  await expectHidden(clientA, "orders", restaurantB.id);

  const { data: changedRows, error: updateError } = await clientA
    .from("orders")
    .update({ status: "done" })
    .eq("id", orderB.order_id)
    .select("id");
  if (updateError) throw updateError;
  assert.deepEqual(changedRows, [], "Lojista A alterou pedido da loja B.");

  const { error: foreignInsertError } = await clientA.from("coupons").insert({
    restaurant_id: restaurantB.id,
    code: `INVASAO-${runId.slice(0, 8)}`,
    value: 1,
    discount_type: "fixed",
  });
  assert.ok(foreignInsertError, "Lojista A inseriu cupom na loja B.");

  const { data: ownerBRows, error: ownerBError } = await clientB
    .from("orders")
    .select("id")
    .eq("id", orderB.order_id);
  if (ownerBError) throw ownerBError;
  assert.equal(ownerBRows.length, 1, "Lojista B nao acessou o proprio pedido.");

  console.log(JSON.stringify({
    ok: true,
    isolated: ["restaurants", "customers", "coupons", "orders", "ifood_integrations"],
    protectedWrites: ["orders.update", "coupons.insert"],
    fixtures: {
      customer: customerB.id,
      coupon: couponB.id,
      integration: integrationB.id,
      order: orderB.order_id,
    },
  }, null, 2));
} finally {
  if (createdRestaurantIds.length > 0) {
    await admin.from("restaurants").delete().in("id", createdRestaurantIds);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}
