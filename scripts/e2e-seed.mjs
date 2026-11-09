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
const PAUSED_ONLY_CATEGORY_ID = "24242424-2424-4242-8242-242424242424";
const PAUSED_PRODUCT_ID = "25252525-2525-4252-8252-252525252525";
const PAUSED_ONLY_PRODUCT_ID = "26262626-2626-4262-8262-262626262626";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const WHEEL_CAMPAIGN_ID = "55555555-5555-4555-8555-555555555555";
const WHEEL_RULE_ID = "66666666-6666-4666-8666-666666666666";
const WHEEL_PRIZE_ID = "77777777-7777-4777-8777-777777777777";
const DESKTOP_ORDER_ID = "88888888-8888-4888-8888-888888888888";
const MOBILE_ORDER_ID = "99999999-9999-4999-8999-999999999999";
const VERIFIED_PHONE_E164 = "+5511988887777";
const VERIFIED_PHONE_LOCAL = "11988887777";

const FOREIGN_RESTAURANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_CUSTOMER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN_CAMPAIGN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FOREIGN_RULE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FOREIGN_PRIZE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const FOREIGN_SPIN_ID = "12121212-1212-4212-8212-121212121212";
const FOREIGN_PHONE_LOCAL = "11977776666";

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
  for (const restaurantId of [RESTAURANT_ID, FOREIGN_RESTAURANT_ID]) {
    const { data: existingOrders, error: ordersLookupError } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", restaurantId);
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
      ["promotion_spins", "restaurant_id"],
      ["promotion_prizes", "restaurant_id"],
      ["promotion_eligibility_rules", "restaurant_id"],
      ["promotion_campaigns", "restaurant_id"],
      ["orders", "restaurant_id"],
      ["customers", "restaurant_id"],
      ["products", "restaurant_id"],
      ["categories", "restaurant_id"],
      ["restaurant_members", "restaurant_id"],
    ]) {
      const { error } = await supabase.from(table).delete().eq(column, restaurantId);
      assertNoError(error, `Falha ao limpar ${table}`);
    }

    const { error: restaurantDeleteError } = await supabase
      .from("restaurants")
      .delete()
      .eq("id", restaurantId);
    assertNoError(restaurantDeleteError, "Falha ao limpar restaurante E2E");
  }

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
    phone: VERIFIED_PHONE_E164,
    phone_confirm: true,
    user_metadata: {
      onboarding_restaurant_name: "Loja E2E CI",
      onboarding_restaurant_slug: "loja-e2e",
    },
  });
  assertNoError(createUserError, "Falha ao criar usuário E2E");

  if (!createdUser.user) {
    throw new Error("Usuário E2E não foi retornado pelo Supabase.");
  }

  const { error: phoneAccountError } = await supabase.from("customer_phone_accounts").insert({
    auth_user_id: createdUser.user.id,
    phone: VERIFIED_PHONE_E164,
  });
  assertNoError(phoneAccountError, "Falha ao vincular telefone verificado E2E");

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

  const { error: pausedOnlyCategoryError } = await supabase.from("categories").insert({
    id: PAUSED_ONLY_CATEGORY_ID,
    restaurant_id: RESTAURANT_ID,
    name: "Categoria Pausada E2E",
    order: 2,
    is_active: true,
  });
  assertNoError(pausedOnlyCategoryError, "Falha ao criar categoria só com itens pausados E2E");

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

  // Local fixture only: a paused item in an active category, and a category
  // containing only paused items. Neither should appear on the public menu.
  const { error: pausedProductsError } = await supabase.from("products").insert([
    {
      id: PAUSED_PRODUCT_ID,
      restaurant_id: RESTAURANT_ID,
      category_id: CATEGORY_ID,
      name: "Prato Pausado E2E",
      description: "Este item não deve aparecer na vitrine",
      price: 29.9,
      image_url: null,
      is_active: false,
      addons: [],
    },
    {
      id: PAUSED_ONLY_PRODUCT_ID,
      restaurant_id: RESTAURANT_ID,
      category_id: PAUSED_ONLY_CATEGORY_ID,
      name: "Produto Exclusivo Pausado E2E",
      description: "Categoria inteira deve ser omitida na vitrine",
      price: 39.9,
      image_url: null,
      is_active: false,
      addons: [],
    },
  ]);
  assertNoError(pausedProductsError, "Falha ao criar produtos pausados E2E");

  const { error: customerError } = await supabase.from("customers").insert({
    id: CUSTOMER_ID,
    restaurant_id: RESTAURANT_ID,
    phone: VERIFIED_PHONE_LOCAL,
    name: "Cliente Roleta E2E",
  });
  assertNoError(customerError, "Falha ao criar cliente verificado da roleta E2E");

  const now = Date.now();
  const startsAt = new Date(now - 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const orderCreatedAt = new Date(now + 1000).toISOString();

  const { error: campaignError } = await supabase.from("promotion_campaigns").insert({
    id: WHEEL_CAMPAIGN_ID,
    restaurant_id: RESTAURANT_ID,
    kind: "roulette",
    name: "Roleta Segura E2E",
    status: "active",
    starts_at: startsAt,
    ends_at: endsAt,
    distribution_mode: "probability",
    auto_pause_on_limit: false,
    created_by: createdUser.user.id,
  });
  assertNoError(campaignError, "Falha ao criar campanha E2E da roleta");

  const { error: ruleError } = await supabase.from("promotion_eligibility_rules").insert({
    id: WHEEL_RULE_ID,
    restaurant_id: RESTAURANT_ID,
    campaign_id: WHEEL_CAMPAIGN_ID,
    rule_type: "completed_order",
    enabled: true,
  });
  assertNoError(ruleError, "Falha ao criar regra E2E da roleta");

  const { error: prizeError } = await supabase.from("promotion_prizes").insert({
    id: WHEEL_PRIZE_ID,
    restaurant_id: RESTAURANT_ID,
    campaign_id: WHEEL_CAMPAIGN_ID,
    prize_type: "fixed",
    label: "R$ 5 de desconto E2E",
    fixed_amount: 5,
    probability: 100,
    reward_validity_minutes: 1440,
    active: true,
    sort_order: 0,
  });
  assertNoError(prizeError, "Falha ao criar prêmio E2E da roleta");

  const { error: eligibleOrdersError } = await supabase.from("orders").insert([
    {
      id: DESKTOP_ORDER_ID,
      restaurant_id: RESTAURANT_ID,
      user_id: createdUser.user.id,
      customer_name: "Cliente Roleta Desktop",
      customer_phone: VERIFIED_PHONE_LOCAL,
      subtotal: 19.9,
      delivery_fee: 0,
      discount: 0,
      total: 19.9,
      status: "done",
      payment_method: "pix",
      created_at: orderCreatedAt,
      is_test: false,
    },
    {
      id: MOBILE_ORDER_ID,
      restaurant_id: RESTAURANT_ID,
      user_id: createdUser.user.id,
      customer_name: "Cliente Roleta Mobile",
      customer_phone: VERIFIED_PHONE_LOCAL,
      subtotal: 19.9,
      delivery_fee: 0,
      discount: 0,
      total: 19.9,
      status: "done",
      payment_method: "pix",
      created_at: new Date(now + 2000).toISOString(),
      is_test: false,
    },
  ]);
  assertNoError(eligibleOrdersError, "Falha ao criar pedidos elegíveis da roleta E2E");

  const { error: foreignRestaurantError } = await supabase.from("restaurants").insert({
    id: FOREIGN_RESTAURANT_ID,
    name: "Loja Estrangeira E2E",
    slug: "loja-estrangeira-e2e",
    primary_color: "#111111",
    work_hours: workHours,
    minimum_order_amount: 0,
    pickup_enabled: true,
    scheduled_orders_enabled: false,
    accepted_payment_methods: ["pix"],
    delivery_tiers: [],
  });
  assertNoError(foreignRestaurantError, "Falha ao criar restaurante estrangeiro E2E");

  const { error: foreignCustomerError } = await supabase.from("customers").insert({
    id: FOREIGN_CUSTOMER_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    phone: FOREIGN_PHONE_LOCAL,
    name: "Cliente Estrangeiro E2E",
  });
  assertNoError(foreignCustomerError, "Falha ao criar cliente estrangeiro E2E");

  const { error: foreignOrderError } = await supabase.from("orders").insert({
    id: FOREIGN_ORDER_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    customer_name: "Cliente Estrangeiro E2E",
    customer_phone: FOREIGN_PHONE_LOCAL,
    subtotal: 30,
    delivery_fee: 0,
    discount: 0,
    total: 30,
    status: "done",
    payment_method: "pix",
    created_at: orderCreatedAt,
    is_test: false,
  });
  assertNoError(foreignOrderError, "Falha ao criar pedido estrangeiro E2E");

  const { error: foreignCampaignError } = await supabase.from("promotion_campaigns").insert({
    id: FOREIGN_CAMPAIGN_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    kind: "roulette",
    name: "Roleta Estrangeira E2E",
    status: "active",
    starts_at: startsAt,
    ends_at: endsAt,
    distribution_mode: "probability",
    auto_pause_on_limit: false,
  });
  assertNoError(foreignCampaignError, "Falha ao criar campanha estrangeira E2E");

  const { error: foreignRuleError } = await supabase.from("promotion_eligibility_rules").insert({
    id: FOREIGN_RULE_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    campaign_id: FOREIGN_CAMPAIGN_ID,
    rule_type: "completed_order",
    enabled: true,
  });
  assertNoError(foreignRuleError, "Falha ao criar regra estrangeira E2E");

  const { error: foreignPrizeError } = await supabase.from("promotion_prizes").insert({
    id: FOREIGN_PRIZE_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    campaign_id: FOREIGN_CAMPAIGN_ID,
    prize_type: "fixed",
    label: "Prêmio estrangeiro secreto",
    fixed_amount: 50,
    probability: 100,
    reward_validity_minutes: 1440,
    active: true,
    sort_order: 0,
  });
  assertNoError(foreignPrizeError, "Falha ao criar prêmio estrangeiro E2E");

  const { error: foreignSpinError } = await supabase.from("promotion_spins").insert({
    id: FOREIGN_SPIN_ID,
    restaurant_id: FOREIGN_RESTAURANT_ID,
    campaign_id: FOREIGN_CAMPAIGN_ID,
    customer_id: FOREIGN_CUSTOMER_ID,
    source_order_id: FOREIGN_ORDER_ID,
    eligibility_rule_id: FOREIGN_RULE_ID,
    idempotency_key: "foreign-e2e-spin-security",
    eligibility_snapshot: { fixture: true },
    status: "pending",
  });
  assertNoError(foreignSpinError, "Falha ao criar giro estrangeiro E2E");

  console.log("Fixture comercial e de segurança da Roleta E2E criada com sucesso.");
}

await seed();
