const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

process.env.ORDER_TRACKING_SECRET = "test-order-tracking-secret-with-at-least-32-bytes";

const root = path.join(__dirname, "..");
const routePath = path.join(root, "src", "app", "api", "orders", "[id]", "tracking", "route.ts");

function loadTsModule(filePath) {
  const mod = new Module(filePath, module.parent);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(
    ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filePath,
  );
  return mod.exports;
}

const state = {
  queries: 0,
  order: {
    id: "order-123",
    restaurant_id: "restaurant-1",
    display_number: 27,
    customer_name: "Maria",
    customer_phone: "11999999999",
    address: {
      cep: "01001000",
      street: "Praça da Sé",
      number: "1",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      complement: "",
      distance: 2,
    },
    subtotal: 20,
    delivery_fee: 5,
    discount: 0,
    total: 25,
    status: "preparing",
    payment_method: "pix",
    change_for: null,
    scheduled_for: null,
    created_at: "2026-07-20T10:00:00.000Z",
    updated_at: "2026-07-20T10:02:00.000Z",
  },
  items: [{ product_name: "X-Burger", quantity: 1, price: 20, observation: null, addons: [] }],
  restaurant: {
    name: "Loja Teste",
    slug: "loja-teste",
    phone: "5511999999999",
    whatsapp_number: null,
    primary_color: "#ff5a1f",
    delivery_tiers: [{ max_km: 5, price: 5, time: 35 }],
  },
};

class QueryBuilder {
  constructor(table) {
    this.table = table;
  }
  select() { return this; }
  eq() { return this; }
  maybeSingle() {
    state.queries += 1;
    if (this.table === "orders") return Promise.resolve({ data: state.order, error: null });
    if (this.table === "restaurants") return Promise.resolve({ data: state.restaurant, error: null });
    return Promise.resolve({ data: null, error: null });
  }
  then(resolve, reject) {
    state.queries += 1;
    const result = this.table === "order_items"
      ? { data: state.items, error: null }
      : { data: null, error: null };
    return Promise.resolve(result).then(resolve, reject);
  }
}

function loadRoute() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }
    if (request === "@/lib/rate-limit") return { checkRateLimit: () => null };
    if (request === "@/lib/supabase/server") {
      return { createAdminClient: () => ({ from: (table) => new QueryBuilder(table) }) };
    }
    if (request === "@/lib/geo") {
      return { calculateDeliveryFee: () => ({ price: 5, time: 35, valid: true }) };
    }
    if (request === "@/lib/order-tracking") {
      return loadTsModule(path.join(root, "src", "lib", "order-tracking.ts"));
    }
    if (request === "@/features/storefront/order-tracking") {
      return loadTsModule(path.join(root, "src", "features", "storefront", "order-tracking.ts"));
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return loadTsModule(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const route = loadRoute();
const tokenHelper = loadTsModule(path.join(root, "src", "lib", "order-tracking.ts"));

test("consulta pedido pelo link assinado sem expor telefone", async () => {
  state.queries = 0;
  const token = tokenHelper.createOrderTrackingToken(state.order.id);
  const response = await route.GET(
    new Request(`http://localhost/api/orders/${state.order.id}/tracking?token=${token}`),
    { params: Promise.resolve({ id: state.order.id }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.displayNumber, "0027");
  assert.equal(body.status, "preparing");
  assert.equal(body.deliveryTime, 35);
  assert.equal(body.customerPhone, undefined);
  assert.equal(body.restaurant.slug, "loja-teste");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
});

test("rejeita token inválido antes de consultar o banco", async () => {
  state.queries = 0;
  const response = await route.GET(
    new Request(`http://localhost/api/orders/${state.order.id}/tracking?token=invalid`),
    { params: Promise.resolve({ id: state.order.id }) },
  );

  assert.equal(response.status, 404);
  assert.equal(state.queries, 0);
});
