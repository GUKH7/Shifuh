const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const routePath = path.join(__dirname, "..", "src", "app", "api", "orders", "route.ts");
let mockState;
let resetRateLimitForTests = () => {};

function baseState(overrides = {}) {
  return {
    user: null,
    restaurant: {
      id: "restaurant-1",
      name: "Loja Teste",
      phone: "5511999999999",
      whatsapp_number: null,
      latitude: -23.55,
      longitude: -46.63,
      address_street: "Rua da Loja",
      address_number: "10",
      address_neighborhood: "Centro",
      address_city: "São Paulo",
      address_state: "SP",
      delivery_tiers: [{ max_km: 5, price: 7, time: 35 }],
    },
    products: [
      {
        id: "product-1",
        name: "X-Burger",
        price: 20,
        is_active: true,
        restaurant_id: "restaurant-1",
        addons: [],
      },
    ],
    coupons: [],
    orders: [],
    orderItems: [],
    customers: [],
    rpcCounter: 0,
    createOrderError: null,
    distance: 2,
    deliveryFeeResult: null,
    ...overrides,
  };
}

function createPayload(overrides = {}) {
  return {
    restaurantId: "restaurant-1",
    customerName: "Cliente Teste",
    customerPhone: "11999999999",
    address: {
      cep: "01001000",
      street: "Praça da Sé",
      number: "1",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      complement: "",
    },
    paymentMethod: "pix",
    cart: [{ productId: "product-1", quantity: 1 }],
    ...overrides,
  };
}

function matches(filters, record) {
  return filters.every((filter) => {
    if (filter.type === "eq") return record[filter.field] === filter.value;
    if (filter.type === "in") return filter.values.includes(record[filter.field]);
    return true;
  });
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.selectOptions = {};
  }

  select(_columns, options = {}) {
    this.selectOptions = options;
    return this;
  }

  eq(field, value) {
    this.filters.push({ type: "eq", field, value });
    return this;
  }

  in(field, values) {
    this.filters.push({ type: "in", field, values });
    return this;
  }

  maybeSingle() {
    if (this.table === "restaurants") {
      const restaurant = matches(this.filters, mockState.restaurant) ? mockState.restaurant : null;
      return Promise.resolve({ data: restaurant, error: null });
    }

    if (this.table === "coupons") {
      const coupon = mockState.coupons.find((item) => matches(this.filters, item)) || null;
      return Promise.resolve({ data: coupon, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  insert(payload) {
    if (this.table === "orders") {
      mockState.orders.push(payload);
    }

    if (this.table === "order_items") {
      mockState.orderItems.push(...payload);
    }

    if (this.table === "customers") {
      mockState.customers.push(payload);
    }

    return Promise.resolve({ data: null, error: null });
  }

  upsert() {
    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }

  resolve() {
    if (this.table === "products") {
      return Promise.resolve({
        data: mockState.products.filter((item) => matches(this.filters, item)),
        error: null,
      });
    }

    if (this.table === "orders" && this.selectOptions.count === "exact") {
      const count = mockState.orders.filter((item) => matches(this.filters, item)).length;
      return Promise.resolve({ data: null, count, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }
}

function createSupabaseMock() {
  return {
    auth: {
      getUser: async () => ({ data: { user: mockState.user } }),
    },
    from: (table) => new QueryBuilder(table),
    rpc: async (name, args) => {
      assert.equal(name, "create_order_transaction");
      if (mockState.createOrderError) {
        return { data: null, error: mockState.createOrderError };
      }

      mockState.rpcCounter += 1;
      const orderId = `order-${mockState.rpcCounter}`;
      const displayNumber = mockState.rpcCounter;

      mockState.orders.push({
        id: orderId,
        restaurant_id: args.p_restaurant_id,
        user_id: args.p_user_id,
        customer_name: args.p_customer_name,
        customer_phone: args.p_customer_phone,
        address: args.p_address,
        subtotal: args.p_subtotal,
        delivery_fee: args.p_delivery_fee,
        discount: args.p_discount,
        total: args.p_total,
        status: args.p_status,
        payment_method: args.p_payment_method,
        change_for: args.p_change_for,
        coupon_code: args.p_coupon_code,
        display_number: displayNumber,
      });
      mockState.orderItems.push(
        ...args.p_items.map((item) => ({
          order_id: orderId,
          ...item,
        })),
      );
      if (args.p_save_customer) {
        mockState.customers.push({
          restaurant_id: args.p_restaurant_id,
          phone: args.p_customer_phone,
          name: args.p_customer_name,
          address_json: args.p_address,
        });
      }

      return { data: [{ order_id: orderId, display_number: displayNumber }], error: null };
    },
  };
}

function loadOrdersRoute() {
  const originalLoad = Module._load;
  const source = fs.readFileSync(routePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }

    if (request === "@/lib/supabase/server") {
      return { createClient: async () => createSupabaseMock() };
    }

    if (request === "@/lib/rate-limit") {
      const rateLimitPath = path.join(__dirname, "..", "src", "lib", "rate-limit.ts");
      const rateLimitSource = fs.readFileSync(rateLimitPath, "utf8");
      const rateLimitCompiled = ts.transpileModule(rateLimitSource, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      const rateLimitModule = new Module(rateLimitPath, module.parent);
      rateLimitModule.filename = rateLimitPath;
      rateLimitModule.paths = Module._nodeModulePaths(path.dirname(rateLimitPath));
      rateLimitModule._compile(rateLimitCompiled, rateLimitPath);
      resetRateLimitForTests = rateLimitModule.exports.resetRateLimitForTests;
      return rateLimitModule.exports;
    }

    if (request === "@/lib/geo") {
      return {
        getCoordinates: async () => ({ lat: -23.56, lon: -46.64 }),
        calculateDistance: () => mockState.distance,
        calculateDeliveryFee: (distance) =>
          mockState.deliveryFeeResult || {
            price: distance <= 5 ? 7 : 0,
            time: 35,
            valid: distance <= 5,
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

async function postOrder(payload) {
  return postOrderWithHeaders(payload);
}

async function postOrderWithHeaders(payload, headers = {}) {
  return POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

async function readJson(response) {
  return response.json();
}

test("ignora preço adulterado no cliente e usa o preço do banco", async () => {
  mockState = baseState();

  const response = await postOrder(
    createPayload({
      cart: [{ productId: "product-1", quantity: 2, price: 0.01, totalPrice: 0.02 }],
      deliveryPreview: { price: 999, time: 1, distance: 0.1, valid: true },
    }),
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.subtotal, 40);
  assert.equal(body.deliveryFee, 7);
  assert.equal(body.total, 47);
  assert.equal(mockState.orders[0].subtotal, 40);
});

test("bloqueia produto inativo", async () => {
  mockState = baseState({
    products: [
      {
        id: "product-1",
        name: "X-Burger",
        price: 20,
        is_active: false,
        restaurant_id: "restaurant-1",
        addons: [],
      },
    ],
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(body.error, /não está mais disponível/i);
  assert.equal(mockState.orders.length, 0);
});

test("bloqueia cupom expirado", async () => {
  mockState = baseState({
    coupons: [
      {
        code: "EXPIRADO",
        restaurant_id: "restaurant-1",
        active: true,
        expires_at: "2020-01-01T00:00:00.000Z",
        usage_limit: null,
        discount_type: "fixed",
        value: 5,
      },
    ],
  });

  const response = await postOrder(createPayload({ couponCode: "expirado" }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error, "Este cupom expirou.");
  assert.equal(mockState.orders.length, 0);
});

test("bloqueia endereço fora da área de entrega", async () => {
  mockState = baseState({ distance: 12 });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(body.error, /fora da área de entrega/i);
  assert.equal(mockState.orders.length, 0);
});

test("reserva display_number via RPC em pedidos concorrentes", async () => {
  mockState = baseState();

  const responses = await Promise.all(
    Array.from({ length: 5 }, () => postOrder(createPayload())),
  );
  const bodies = await Promise.all(responses.map(readJson));

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200, 200, 200],
  );
  assert.deepEqual(
    bodies.map((body) => body.displayNumber),
    ["0001", "0002", "0003", "0004", "0005"],
  );
  assert.deepEqual(
    mockState.orders.map((order) => order.display_number),
    [1, 2, 3, 4, 5],
  );
});

test("nao grava pedido nem itens quando a RPC transacional falha", async () => {
  mockState = baseState({
    createOrderError: { message: "falha transacional" },
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.error, "falha transacional");
  assert.equal(mockState.orders.length, 0);
  assert.equal(mockState.orderItems.length, 0);
  assert.equal(mockState.customers.length, 0);
});

test("bloqueia excesso de tentativas na API publica de pedidos", async () => {
  resetRateLimitForTests();
  mockState = baseState();
  const headers = { "x-forwarded-for": "203.0.113.77" };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await postOrderWithHeaders(createPayload(), headers);
    assert.equal(response.status, 200);
  }

  const response = await postOrderWithHeaders(createPayload(), headers);
  const body = await readJson(response);

  assert.equal(response.status, 429);
  assert.match(body.error, /Muitas tentativas/i);
  assert.equal(response.headers.get("X-RateLimit-Limit"), "12");
  assert.equal(response.headers.get("X-RateLimit-Remaining"), "0");
  assert.ok(response.headers.get("Retry-After"));
});
