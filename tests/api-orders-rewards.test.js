const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

process.env.ORDER_TRACKING_SECRET = "reward-route-test-order-tracking-secret-32-bytes";

const routePath = path.join(__dirname, "..", "src", "app", "api", "orders", "route.ts");
let state;

function baseState(overrides = {}) {
  return {
    user: { id: "auth-1" },
    rewardContext: {
      authUserId: "auth-1",
      phone: "11999999999",
      normalizedPhone: "+5511999999999",
      name: "Cliente Teste",
    },
    restaurant: {
      id: "restaurant-1",
      name: "Loja Teste",
      phone: "5511999999999",
      whatsapp_number: null,
      latitude: null,
      longitude: null,
      address_zip: "01001000",
      address_street: "Rua da Loja",
      address_number: "10",
      address_neighborhood: "Centro",
      address_city: "São Paulo",
      address_state: "SP",
      delivery_tiers: [],
      delivery_rules: null,
      work_hours: [],
      minimum_order_amount: 0,
      scheduled_orders_enabled: false,
      scheduled_order_lead_minutes: 60,
      pickup_enabled: true,
      accepted_payment_methods: ["pix", "cash"],
    },
    products: [{
      id: "product-1",
      name: "Prato Teste",
      price: 100,
      is_active: true,
      restaurant_id: "restaurant-1",
      addons: [],
    }],
    reward: {
      id: "reward-1",
      restaurant_id: "restaurant-1",
      customer_id: "customer-1",
      reward_type: "percent",
      label: "10% OFF",
      percentage_value: 10,
      fixed_amount: null,
      product_id: null,
      minimum_order_amount: 0,
      status: "available",
      expires_at: "2099-01-01T00:00:00.000Z",
      redeemed_order_id: null,
    },
    customer: {
      id: "customer-1",
      restaurant_id: "restaurant-1",
      phone: "11999999999",
    },
    orders: [],
    rpcCalls: [],
    nextDisplayNumber: 1,
    ...overrides,
  };
}

function matches(filters, record) {
  return Boolean(record) && filters.every(({ field, value, values, type }) => {
    if (type === "eq") return record[field] === value;
    if (type === "in") return values.includes(record[field]);
    return true;
  });
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.selectOptions = {};
  }

  select(_columns, options = {}) { this.selectOptions = options; return this; }
  eq(field, value) { this.filters.push({ type: "eq", field, value }); return this; }
  in(field, values) { this.filters.push({ type: "in", field, values }); return this; }
  not() { return this; }
  order() { return this; }
  range() { return this; }

  async maybeSingle() {
    if (this.table === "restaurants") {
      return { data: matches(this.filters, state.restaurant) ? state.restaurant : null, error: null };
    }
    if (this.table === "customer_rewards") {
      return { data: matches(this.filters, state.reward) ? state.reward : null, error: null };
    }
    if (this.table === "customers") {
      return { data: matches(this.filters, state.customer) ? state.customer : null, error: null };
    }
    if (this.table === "orders") {
      return { data: state.orders.find((order) => matches(this.filters, order)) || null, error: null };
    }
    if (this.table === "products") {
      return { data: state.products.find((product) => matches(this.filters, product)) || null, error: null };
    }
    return { data: null, error: null };
  }

  upsert() { return Promise.resolve({ data: null, error: null }); }
  insert() { return Promise.resolve({ data: null, error: null }); }

  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }

  resolve() {
    if (this.table === "products") {
      return Promise.resolve({
        data: state.products.filter((product) => matches(this.filters, product)),
        error: null,
      });
    }
    if (this.table === "orders" && this.selectOptions.count === "exact") {
      return Promise.resolve({
        data: null,
        count: state.orders.filter((order) => matches(this.filters, order)).length,
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function rewardDiscount(reward, subtotal, deliveryFee) {
  if (reward.reward_type === "percent") return Math.min(subtotal * Number(reward.percentage_value || 0) / 100, subtotal);
  if (reward.reward_type === "fixed") return Math.min(Number(reward.fixed_amount || 0), subtotal);
  if (reward.reward_type === "free_shipping") return deliveryFee;
  return 0;
}

function createSupabaseMock(role) {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table) => new QueryBuilder(table),
    rpc: async (name, args) => {
      state.rpcCalls.push({ role, name, args });
      if (name !== "create_storefront_order_with_reward_transaction") {
        throw new Error(`Unexpected RPC in reward route test: ${name}`);
      }

      const existing = state.orders.find(
        (order) => order.restaurant_id === args.p_restaurant_id && order.idempotency_key === args.p_idempotency_key,
      );
      if (existing) {
        return {
          data: [{
            order_id: existing.id,
            display_number: existing.display_number,
            reward_discount: existing.discount,
            order_total: existing.total,
            reward_id: state.reward.id,
            reward_type: state.reward.reward_type,
            reward_label: state.reward.label,
          }],
          error: null,
        };
      }

      const discount = Math.round(rewardDiscount(state.reward, Number(args.p_subtotal), Number(args.p_delivery_fee)) * 100) / 100;
      const total = Math.round((Number(args.p_subtotal) + Number(args.p_delivery_fee) - discount) * 100) / 100;
      const order = {
        id: `order-${state.nextDisplayNumber}`,
        restaurant_id: args.p_restaurant_id,
        idempotency_key: args.p_idempotency_key,
        display_number: state.nextDisplayNumber,
        total,
        discount,
        change_for: args.p_change_for,
      };
      state.nextDisplayNumber += 1;
      state.orders.push(order);
      state.reward = {
        ...state.reward,
        status: "redeemed",
        redeemed_order_id: order.id,
      };

      return {
        data: [{
          order_id: order.id,
          display_number: order.display_number,
          reward_discount: discount,
          order_total: total,
          reward_id: state.reward.id,
          reward_type: state.reward.reward_type,
          reward_label: state.reward.label,
        }],
        error: null,
      };
    },
  };
}

function parseCurrencyInput(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadOrdersRoute() {
  const source = fs.readFileSync(routePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    if (request === "@/lib/rate-limit") {
      return { checkRateLimit: async () => null };
    }
    if (request === "@/lib/supabase/server") {
      return {
        createClient: async () => createSupabaseMock("public"),
        createAdminClient: () => createSupabaseMock("admin"),
      };
    }
    if (request === "@/lib/promotions/customer-context") {
      return { resolveCustomerPromotionContext: async () => state.rewardContext || null };
    }
    if (request === "@/lib/delivery-quote") {
      class DeliveryQuoteError extends Error {}
      return {
        DeliveryQuoteError,
        calculateDeliveryQuote: async () => ({ price: 0, time: 0, distance: 0 }),
      };
    }
    if (request === "@/features/storefront/store-summary") {
      return { getStoreStatus: () => ({ tone: "open" }) };
    }
    if (request === "@/lib/order-tracking") {
      return { createOrderTrackingToken: () => "tracking-token" };
    }
    if (request === "@/lib/customer-account") {
      return {
        CUSTOMER_SESSION_COOKIE: "gestor_customer_session",
        ensureCustomerAccount: async () => null,
      };
    }
    if (request === "@/features/storefront/checkout-format") {
      return {
        getCheckoutAddressErrors: () => ({}),
        isStorefrontPaymentMethod: (value) => ["pix", "cash", "credit", "debit"].includes(value),
        normalizeStorefrontPaymentMethods: (value) => Array.isArray(value) ? value : ["pix", "cash"],
        parseCurrencyInput,
        getChangeForError: (value, total) => {
          const parsed = parseCurrencyInput(value);
          if (parsed === null) return "Informe um valor válido para o troco.";
          return parsed < total ? "O valor para troco precisa cobrir o total do pedido." : null;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(routePath, module.parent);
    mod.filename = routePath;
    mod.paths = Module._nodeModulePaths(path.dirname(routePath));
    mod._compile(compiled, routePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const { POST } = loadOrdersRoute();

function payload(overrides = {}) {
  return {
    restaurantId: "restaurant-1",
    customerName: "Cliente Teste",
    customerPhone: "11999999999",
    address: {},
    paymentMethod: "pix",
    rewardId: "reward-1",
    cart: [{ productId: "product-1", quantity: 1 }],
    fulfillmentType: "pickup",
    ...overrides,
  };
}

async function post(body, idempotencyKey) {
  return POST(new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  }));
}

test("aplica recompensa percentual pelo RPC transacional de recompensa", async () => {
  state = baseState();
  const response = await post(payload(), "11111111-1111-4111-8111-111111111111");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.subtotal, 100);
  assert.equal(body.discount, 10);
  assert.equal(body.total, 90);
  assert.equal(body.reward.id, "reward-1");
  assert.equal(body.reward.type, "percent");
  assert.equal(state.orders.length, 1);
  assert.equal(state.reward.status, "redeemed");
  assert.equal(state.rpcCalls.filter((call) => call.name === "create_storefront_order_with_reward_transaction").length, 1);
});

test("retry em dinheiro preserva total descontado e troco do pedido já confirmado", async () => {
  const idempotencyKey = "22222222-2222-4222-8222-222222222222";
  state = baseState({
    reward: {
      ...baseState().reward,
      reward_type: "fixed",
      label: "R$ 20 OFF",
      percentage_value: null,
      fixed_amount: 20,
      status: "redeemed",
      redeemed_order_id: "order-existing",
    },
    orders: [{
      id: "order-existing",
      restaurant_id: "restaurant-1",
      idempotency_key: idempotencyKey,
      display_number: 7,
      total: 80,
      discount: 20,
      change_for: "90.00",
    }],
  });

  const response = await post(payload({ paymentMethod: "cash", changeFor: "R$ 90,00" }), idempotencyKey);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.orderId, "order-existing");
  assert.equal(body.displayNumber, "0007");
  assert.equal(body.discount, 20);
  assert.equal(body.total, 80);
  assert.equal(body.changeFor, "90.00");
  assert.equal(state.orders.length, 1);
});

test("recompensa exige contexto de telefone autenticado e verificado", async () => {
  state = baseState({ rewardContext: null });

  const response = await post(payload(), "33333333-3333-4333-8333-333333333333");
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.code, "REWARD_SESSION_REQUIRED");
  assert.equal(state.rpcCalls.length, 0);
});

test("recompensa não pode ser usada por outro telefone autenticado", async () => {
  state = baseState({
    rewardContext: {
      authUserId: "auth-other",
      phone: "11888888888",
      normalizedPhone: "+5511888888888",
      name: "Outro Cliente",
    },
  });

  const response = await post(payload(), "44444444-4444-4444-8444-444444444444");
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "REWARD_CUSTOMER_MISMATCH");
  assert.equal(state.rpcCalls.length, 0);
});
