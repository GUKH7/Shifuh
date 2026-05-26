const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const routePath = path.join(__dirname, "..", "src", "app", "api", "orders", "route.ts");
let mockState;

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
    rpc: async (name) => {
      assert.equal(name, "next_order_display_number");
      mockState.rpcCounter += 1;
      return { data: mockState.rpcCounter, error: null };
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
  return POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
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
