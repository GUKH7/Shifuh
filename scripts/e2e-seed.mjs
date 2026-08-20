import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_ADMIN_EMAIL || "e2e-owner@shifuh.test";
const password = process.env.E2E_ADMIN_PASSWORD || "Shifuh-E2E-2026!";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase local não configurado para o seed E2E.");
}

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

async function removePreviousFixture() {
  const { data: existingOrders, error: ordersLookupError } = await supabase
    .from("orders")
    .select("id")
    .eq("restaurant_id", RESTAURANT_ID);
  assertNoError(ordersLookupError, "Falha ao localizar pedidos E2E anteriores");

  const orderIds = (existingOrders || []).map((order) => order.id);
  if (orderIds.length > 0) {
    const { error: itemDeleteError } = await supabase
      .from("order_items")
      .delete()
      .in("order_id", orderIds);
    assertNoError(itemDeleteError, "Falha ao limpar itens de pedidos E2E");
  }

  for (const [table, column] of [
    ["orders", "restaurant_id"],
    ["products", "restaurant_id"],
    ["categories", "restaurant_id"],
    ["restaurant_members", "restaurant_id"],
  ]) {
    const { error } = await supabase.from(table).delete().eq(column, RESTAURANT_ID);
    assertNoError(error, `Falha ao limpar ${table}`);
  }

  const { error: restaurantDeleteError } = await supabase
    .from("restaurants")
    .delete()
    .eq("id", RESTAURANT_ID);
  assertNoError(restaurantDeleteError, "Falha ao limpar restaurante E2E");

  const { data: users, error: listUsersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  assertNoError(listUsersError, "Falha ao listar usuários E2E");

  const existingUser = users.users.find((user) => user.email === email);
  if (existingUser) {
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(existingUser.id);
    assertNoError(deleteUserError, "Falha ao remover usuário E2E anterior");
  }
}

async function seed() {
  await removePreviousFixture();

  const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      onboarding_restaurant_name: "Loja E2E CI",
      onboarding_restaurant_slug: "loja-e2e",
    },
  });
  assertNoError(createUserError, "Falha ao criar usuário E2E");

  if (!createdUser.user) {
    throw new Error("Usuário E2E não foi retornado pelo Supabase.");
  }

  const workHours = Array.from({ length: 7 }, (_, dayId) => ({
    day_id: dayId,
    day_label: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dayId],
    is_open: true,
    open_time: "00:00",
    close_time: "23:59",
  }));

  const { error: restaurantError } = await supabase.from("restaurants").insert({
    id: RESTAURANT_ID,
    user_id: createdUser.user.id,
    name: "Loja E2E CI",
    slug: "loja-e2e",
    description: "Fixture comercial isolada do GitHub Actions",
    phone: "11999999999",
    whatsapp_number: "11999999999",
    primary_color: "#ff5a1f",
    work_hours: workHours,
    minimum_order_amount: 0,
    pickup_enabled: true,
    scheduled_orders_enabled: false,
    accepted_payment_methods: ["pix"],
    delivery_tiers: [{ distance: 5, price: 5, time: 30 }],
    address_zip: "01001-000",
    address_street: "Praça da Sé",
    address_number: "100",
    address_neighborhood: "Sé",
    address_city: "São Paulo",
    address_state: "SP",
    storefront_theme: {
      preset: "sunset",
      show_logo: false,
      show_banners: false,
      show_reviews: false,
      card_style: "soft",
      hero_style: "banner",
      catalog_layout: "grid",
    },
  });
  assertNoError(restaurantError, "Falha ao criar restaurante E2E");

  const { error: membershipError } = await supabase.from("restaurant_members").insert({
    restaurant_id: RESTAURANT_ID,
    user_id: createdUser.user.id,
    role: "owner",
    is_default: true,
  });
  assertNoError(membershipError, "Falha ao vincular proprietário E2E");

  const { error: categoryError } = await supabase.from("categories").insert({
    id: CATEGORY_ID,
    restaurant_id: RESTAURANT_ID,
    name: "Pratos E2E",
    order: 1,
    is_active: true,
  });
  assertNoError(categoryError, "Falha ao criar categoria E2E");

  const { error: productError } = await supabase.from("products").insert({
    id: PRODUCT_ID,
    restaurant_id: RESTAURANT_ID,
    category_id: CATEGORY_ID,
    name: "Prato E2E CI",
    description: "Produto real da fixture isolada do fluxo comercial",
    price: 19.9,
    image_url: null,
    is_active: true,
    addons: [],
  });
  assertNoError(productError, "Falha ao criar produto E2E");

  console.log("Fixture comercial E2E criada com sucesso.");
}

await seed();
