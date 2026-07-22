const assert = require("node:assert/strict");
const Module = require("node:module");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

process.env.ORDER_TRACKING_SECRET = "test-order-tracking-secret-with-at-least-32-bytes";

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
      work_hours: [],
      minimum_order_amount: 0,
      pickup_enabled: false,
      scheduled_orders_enabled: false,
      scheduled_order_lead_minutes: 60,
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
    savedAddresses: [],
    rpcCounter: 0,
    publicRpcCalls: 0,
    adminRpcCalls: 0,
    createOrderError: null,
    distance: 2,
    deliveryFeeResult: null,
    lastClientCoordinatesRequest: null,
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

    if (this.table === "customer_addresses") {
      mockState.savedAddresses.push(payload);
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

function createSupabaseMock(role = "public") {
  return {
    auth: {
      getUser: async () => ({ data: { user: mockState.user } }),
    },
    from: (table) => new QueryBuilder(table),
    rpc: async (name, args) => {
      assert.equal(name, "create_storefront_order_transaction");
      if (role === "admin") mockState.adminRpcCalls += 1;
      else mockState.publicRpcCalls += 1;
      if (mockState.createOrderError) {
        return { data: null, error: mockState.createOrderError };
      }

      const existingOrder = mockState.orders.find(
        (order) => order.restaurant_id === args.p_restaurant_id && order.idempotency_key === args.p_idempotency_key,
      );
      if (existingOrder) {
        return {
          data: [{ order_id: existingOrder.id, display_number: existingOrder.display_number }],
          error: null,
        };
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
        scheduled_for: args.p_scheduled_for,
        idempotency_key: args.p_idempotency_key,
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
      return {
        createAdminClient: () => createSupabaseMock("admin"),
        createClient: async () => createSupabaseMock("public"),
      };
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
        getCoordinates: async (address) => {
          const isRestaurantAddress =
            address.street === mockState.restaurant.address_street &&
            address.number === mockState.restaurant.address_number;
          if (isRestaurantAddress) {
            return mockState.restaurantCoordinates === undefined
              ? { lat: -23.55, lon: -46.63 }
              : mockState.restaurantCoordinates;
          }
          mockState.lastClientCoordinatesRequest = address;
          return mockState.clientCoordinates === undefined
            ? { lat: -23.56, lon: -46.64 }
            : mockState.clientCoordinates;
        },
        calculateDistance: () => mockState.distance,
        calculateDeliveryFee: (distance) =>
          mockState.deliveryFeeResult || {
            price: distance <= 5 ? 7 : 0,
            time: 35,
            valid: distance <= 5,
          },
      };
    }

    if (request === "@/lib/order-tracking") {
      const trackingPath = path.join(__dirname, "..", "src", "lib", "order-tracking.ts");
      const trackingModule = new Module(trackingPath, module.parent);
      trackingModule.filename = trackingPath;
      trackingModule.paths = Module._nodeModulePaths(path.dirname(trackingPath));
      trackingModule._compile(
        ts.transpileModule(fs.readFileSync(trackingPath, "utf8"), {
          compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        trackingPath,
      );
      return trackingModule.exports;
    }

    if (request === "@/lib/customer-account") {
      return {
        CUSTOMER_SESSION_COOKIE: "gestor_customer_session",
        ensureCustomerAccount: async () => null,
      };
    }

    if (request === "@/features/storefront/store-summary") {
      const summaryPath = path.join(__dirname, "..", "src", "features", "storefront", "store-summary.ts");
      const summarySource = fs.readFileSync(summaryPath, "utf8");
      const summaryCompiled = ts.transpileModule(summarySource, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      const summaryModule = new Module(summaryPath, module.parent);
      summaryModule.filename = summaryPath;
      summaryModule.paths = Module._nodeModulePaths(path.dirname(summaryPath));
      summaryModule._compile(summaryCompiled, summaryPath);
      return summaryModule.exports;
    }

    if (request === "@/features/storefront/checkout-format") {
      const checkoutPath = path.join(__dirname, "..", "src", "features", "storefront", "checkout-format.ts");
      const checkoutSource = fs.readFileSync(checkoutPath, "utf8");
      const checkoutCompiled = ts.transpileModule(checkoutSource, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      const checkoutModule = new Module(checkoutPath, module.parent);
      checkoutModule.filename = checkoutPath;
      checkoutModule.paths = Module._nodeModulePaths(path.dirname(checkoutPath));
      checkoutModule._compile(checkoutCompiled, checkoutPath);
      return checkoutModule.exports;
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
      headers: { "content-type": "application/json", "idempotency-key": randomUUID(), ...headers },
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
  assert.match(body.trackingPath, /^\/acompanhar\/order-1\?token=/);
  assert.match(body.trackingUrl, /^http:\/\/localhost\/acompanhar\/order-1\?token=/);
  assert.equal(mockState.orders[0].subtotal, 40);
  assert.equal(mockState.adminRpcCalls, 1);
  assert.equal(mockState.publicRpcCalls, 0);
});

test("aceita endereço sem número sem enviar S/N para a geocodificação", async () => {
  mockState = baseState();

  const response = await postOrder(createPayload({
    address: { ...createPayload().address, number: "S/N" },
  }));

  assert.equal(response.status, 200);
  assert.equal(mockState.lastClientCoordinatesRequest.number, undefined);
  assert.equal(mockState.orders[0].address.number, "S/N");
});

test("bloqueia retirada quando a loja não habilitou a opção", async () => {
  resetRateLimitForTests();
  mockState = baseState();

  const response = await postOrder(createPayload({ fulfillmentType: "pickup", address: {} }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "PICKUP_DISABLED");
  assert.equal(mockState.orders.length, 0);
});

test("cria retirada sem exigir endereço do cliente ou calcular frete", async () => {
  resetRateLimitForTests();
  mockState = baseState({
    restaurant: { ...baseState().restaurant, pickup_enabled: true },
  });

  const response = await postOrder(createPayload({ fulfillmentType: "pickup", address: {} }));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.fulfillmentType, "pickup");
  assert.equal(body.deliveryFee, 0);
  assert.equal(body.total, 20);
  assert.equal(mockState.lastClientCoordinatesRequest, null);
  assert.equal(mockState.orders[0].address.fulfillment_type, "pickup");
  assert.equal(mockState.orders[0].address.street, "Rua da Loja");
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

  assert.equal(response.status, 409);
  assert.equal(body.code, "ITEM_UNAVAILABLE");
  assert.deepEqual(body.unavailableProductIds, ["product-1"]);
  assert.equal(mockState.orders.length, 0);
});

test("informa todos os produtos removidos de uma sacola persistida", async () => {
  mockState = baseState();

  const response = await postOrder(createPayload({
    cart: [
      { productId: "product-1", quantity: 1 },
      { productId: "product-removed", quantity: 1 },
    ],
  }));
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.code, "ITEM_UNAVAILABLE");
  assert.deepEqual(body.unavailableProductIds, ["product-removed"]);
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

  assert.equal(response.status, 422);
  assert.equal(body.code, "OUTSIDE_DELIVERY_AREA");
  assert.match(body.error, /fora da área de entrega/i);
  assert.equal(mockState.orders.length, 0);
});

test("diferencia endereço incompleto de endereço fora da área", async () => {
  mockState = baseState();

  const response = await postOrder(createPayload({
    address: { ...createPayload().address, city: "", state: "XX" },
  }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "INCOMPLETE_ADDRESS");
  assert.deepEqual(body.fields.sort(), ["city", "state"]);
  assert.equal(mockState.orders.length, 0);
});

test("bloqueia pedido quando o endereço não pode ser localizado no servidor", async () => {
  mockState = baseState({ clientCoordinates: null });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 422);
  assert.equal(body.code, "ADDRESS_NOT_FOUND");
  assert.equal(mockState.orders.length, 0);
});

test("bloqueia pedido quando a origem da loja não pode ser calculada", async () => {
  mockState = baseState({
    restaurant: {
      ...baseState().restaurant,
      latitude: null,
      longitude: null,
    },
    restaurantCoordinates: null,
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "DELIVERY_CALCULATION_UNAVAILABLE");
  assert.equal(mockState.orders.length, 0);
});

test("salva endereço somente com autorização explícita do cliente autenticado", async () => {
  resetRateLimitForTests();
  mockState = baseState({ user: { id: "customer-1" } });

  const firstResponse = await postOrder(createPayload({ saveAddress: false }));
  assert.equal(firstResponse.status, 200);
  assert.equal(mockState.savedAddresses.length, 0);

  const secondResponse = await postOrder(createPayload({ saveAddress: true }));
  assert.equal(secondResponse.status, 200);
  assert.equal(mockState.savedAddresses.length, 1);
  assert.equal(mockState.savedAddresses[0].user_id, "customer-1");
});

test("bloqueia pedido imediato quando a loja está fechada", async () => {
  resetRateLimitForTests();
  mockState = baseState({
    restaurant: {
      ...baseState().restaurant,
      work_hours: Array.from({ length: 7 }, (_, dayId) => ({
        day_id: dayId,
        is_open: false,
        open_time: "00:00",
        close_time: "00:00",
      })),
    },
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(body.code, "STORE_CLOSED");
  assert.equal(mockState.orders.length, 0);
});

test("aplica pedido mínimo usando o subtotal recalculado no servidor", async () => {
  resetRateLimitForTests();
  mockState = baseState({
    restaurant: {
      ...baseState().restaurant,
      minimum_order_amount: 50,
    },
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "MINIMUM_ORDER_NOT_REACHED");
  assert.equal(body.minimumOrderAmount, 50);
  assert.equal(body.missingAmount, 30);
  assert.equal(mockState.orders.length, 0);
});

test("rejeita agendamento quando a loja não habilitou a opção", async () => {
  resetRateLimitForTests();
  mockState = baseState();

  const response = await postOrder(createPayload({
    scheduledFor: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "SCHEDULING_DISABLED");
  assert.equal(mockState.orders.length, 0);
});

test("registra agendamento habilitado na mesma transacao do pedido", async () => {
  resetRateLimitForTests();
  const scheduledFor = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  mockState = baseState({
    restaurant: {
      ...baseState().restaurant,
      scheduled_orders_enabled: true,
      scheduled_order_lead_minutes: 60,
    },
  });

  const response = await postOrder(createPayload({ scheduledFor }));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.scheduledFor, scheduledFor);
  assert.equal(mockState.orders[0].scheduled_for, scheduledFor);
  assert.equal(mockState.adminRpcCalls, 1);
});

test("rejeita forma de pagamento adulterada", async () => {
  resetRateLimitForTests();
  mockState = baseState();

  const response = await postOrder(createPayload({ paymentMethod: "free-card" }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_PAYMENT_METHOD");
  assert.equal(mockState.orders.length, 0);
});

test("valida e normaliza o valor de troco no servidor", async () => {
  resetRateLimitForTests();
  mockState = baseState();

  const invalidResponse = await postOrder(createPayload({ paymentMethod: "cash", changeFor: "R$ 20,00" }));
  const invalidBody = await readJson(invalidResponse);
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidBody.code, "INVALID_CHANGE_FOR");

  const validResponse = await postOrder(createPayload({ paymentMethod: "cash", changeFor: "R$ 50,00" }));
  assert.equal(validResponse.status, 200);
  assert.equal(mockState.orders[0].change_for, "50.00");
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

test("reutiliza o mesmo pedido quando a tentativa e repetida", async () => {
  resetRateLimitForTests();
  mockState = baseState();
  const idempotencyKey = randomUUID();

  const [firstResponse, repeatedResponse] = await Promise.all([
    postOrderWithHeaders(createPayload(), { "idempotency-key": idempotencyKey }),
    postOrderWithHeaders(createPayload(), { "idempotency-key": idempotencyKey }),
  ]);
  const [firstBody, repeatedBody] = await Promise.all([
    readJson(firstResponse),
    readJson(repeatedResponse),
  ]);

  assert.equal(firstResponse.status, 200);
  assert.equal(repeatedResponse.status, 200);
  assert.equal(firstBody.orderId, repeatedBody.orderId);
  assert.equal(firstBody.displayNumber, repeatedBody.displayNumber);
  assert.equal(mockState.orders.length, 1);
  assert.equal(mockState.orders[0].idempotency_key, idempotencyKey);
});

test("nao grava pedido nem itens quando a RPC transacional falha", async () => {
  mockState = baseState({
    createOrderError: { message: "falha transacional" },
  });

  const response = await postOrder(createPayload());
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "ORDER_CREATION_FAILED");
  assert.match(body.error, /não foi possível registrar/i);
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
