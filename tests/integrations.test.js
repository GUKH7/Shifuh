const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const projectRoot = path.join(__dirname, "..");
const ifoodConnectionRoutePath = path.join(
  projectRoot,
  "src",
  "app",
  "api",
  "integrations",
  "ifood",
  "connection",
  "route.ts",
);
const ifoodActionRoutePath = path.join(
  projectRoot,
  "src",
  "app",
  "api",
  "integrations",
  "ifood",
  "orders",
  "action",
  "route.ts",
);
const ifoodSyncRoutePath = path.join(
  projectRoot,
  "src",
  "app",
  "api",
  "integrations",
  "ifood",
  "orders",
  "sync",
  "route.ts",
);
const ifoodEventsRoutePath = path.join(
  projectRoot,
  "src",
  "app",
  "api",
  "integrations",
  "ifood",
  "orders",
  "events",
  "route.ts",
);

function compileTs(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

class QueryBuilder {
  constructor(table, state, scope) {
    this.table = table;
    this.state = state;
    this.scope = scope;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
  }

  select() {
    this.operation = "select";
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload, options) {
    this.operation = "upsert";
    this.payload = payload;
    this.options = options;
    return this.resolve();
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, value, ilike: true });
    return this;
  }

  order(column, options) {
    this.ordering = this.ordering || [];
    this.ordering.push({ column, options });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this.resolve();
  }

  maybeSingle() {
    if (this.table === "restaurants") {
      const idFilter = this.filters.find((filter) => filter.column === "id")?.value;
      const userFilter = this.filters.find((filter) => filter.column === "user_id")?.value;
      const ownsRestaurant =
        this.state.ownedRestaurant &&
        (!idFilter || idFilter === this.state.ownedRestaurant.id) &&
        (!userFilter || userFilter === this.state.ownedRestaurant.user_id);

      return Promise.resolve({
        data: ownsRestaurant ? this.state.ownedRestaurant : null,
        error: null,
      });
    }

    if (this.table === "orders") {
      const idFilter = this.filters.find((filter) => filter.column === "id")?.value;
      const order = this.state.order && (!idFilter || idFilter === this.state.order.id)
        ? this.state.order
        : null;

      return Promise.resolve({ data: order, error: null });
    }

    if (this.table === "ifood_integrations") {
      return Promise.resolve({
        data: this.state.integration || null,
        error: this.state.integrationError || null,
      });
    }

    return Promise.resolve({ data: null, error: null });
  }

  resolve() {
    if (this.table === "ifood_integrations" && this.operation === "select") {
      const rows = this.state.bindings || (this.state.integration ? [{
        restaurant_id: this.state.ownedRestaurant?.id,
        ...this.state.integration,
      }] : []);
      const merchant = this.filters.find(filter => filter.ilike)?.value;
      return Promise.resolve({ data: rows.filter(row => !merchant || row.merchant_id?.toLowerCase() === merchant), error: this.state.bindingError || null });
    }

    if (this.table === "ifood_integrations" && this.operation === "upsert") {
      this.state.integrationUpserts.push({
        payload: this.payload,
        options: this.options,
      });

      return Promise.resolve({ data: null, error: this.state.integrationUpsertError || null });
    }

    if (this.table === "orders" && this.operation === "update") {
      this.state.orderUpdates.push({
        payload: this.payload,
        filters: this.filters,
      });
    }

    if (this.table === "ifood_integrations" && this.operation === "update") {
      this.state.integrationUpdates.push({
        payload: this.payload,
        filters: this.filters,
      });
    }

    if (this.table === "ifood_order_events" && this.operation === "select") {
      return Promise.resolve({
        data: this.state.events || [],
        error: this.state.eventsError || null,
      });
    }

    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }
}

function createSupabaseMock(state, scope) {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user || null }, error: null }),
    },
    from: (table) => new QueryBuilder(table, state, scope),
  };
}

function loadRoute(filePath, state, aliases = {}) {
  const originalLoad = Module._load;
  const compiled = compileTs(filePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(aliases, request)) {
      return aliases[request];
    }

    if (request === "@/lib/ifood/merchant-isolation") {
      const file = path.join(projectRoot, "src/lib/ifood/merchant-isolation.ts");
      const child = new Module(file, module.parent);
      child.filename = file;
      child.paths = Module._nodeModulePaths(path.dirname(file));
      child._compile(compileTs(file), file);
      return child.exports;
    }

    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }

    if (request === "@/lib/supabase/server") {
      return {
        createAdminClient: () => createSupabaseMock(state, "admin"),
        createClient: async () => createSupabaseMock(state, "user"),
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const mod = new Module(filePath, module.parent);
    mod.filename = filePath;
    mod.paths = Module._nodeModulePaths(path.dirname(filePath));
    mod._compile(compiled, filePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function jsonRequest(payload) {
  return new Request("http://localhost/api/integrations", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

test("bloqueia teste de conexao iFood sem usuario autenticado", async () => {
  const state = {
    user: null,
    ownedRestaurant: null,
    integrationUpserts: [],
    orderUpdates: [],
  };
  let validateCalled = false;
  const { POST } = loadRoute(ifoodConnectionRoutePath, state, {
    "@/lib/ifood/catalog": {
      validateIfoodCredentials: async () => {
        validateCalled = true;
      },
      listIfoodCatalogs: async () => [],
      pickMainCatalog: () => null,
    },
  });

  const response = await POST(jsonRequest({ restaurantId: "restaurant-1", merchantId: "merchant-1" }));
  const body = await readJson(response);

  assert.equal(response.status, 401);
  assert.match(body.error, /autenticado/i);
  assert.equal(validateCalled, false);
  assert.equal(state.integrationUpserts.length, 0);
});

test("valida conexao iFood e salva merchant/catalogo resolvido", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integrationUpserts: [],
    orderUpdates: [],
  };
  const { POST } = loadRoute(ifoodConnectionRoutePath, state, {
    "@/lib/ifood/catalog": {
      validateIfoodCredentials: async () => true,
      listIfoodCatalogs: async (merchantId) => {
        assert.equal(merchantId, "merchant-1");
        return [
          { catalogId: "catalog-secondary", status: "UNAVAILABLE", context: [] },
          { catalogId: "catalog-main", status: "AVAILABLE", context: ["DEFAULT"] },
        ];
      },
      pickMainCatalog: (catalogs) => catalogs.find((catalog) => catalog.context?.includes("DEFAULT")) || catalogs[0],
    },
  });

  const response = await POST(jsonRequest({ restaurantId: "restaurant-1", merchantId: "merchant-1" }));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.stage, "catalog");
  assert.equal(body.resolvedCatalogId, "catalog-main");
  assert.equal(state.integrationUpserts.length, 1);
  assert.equal(state.integrationUpserts[0].options.onConflict, "restaurant_id");
  assert.deepEqual(state.integrationUpserts[0].payload, {
    restaurant_id: "restaurant-1",
    merchant_id: "merchant-1",
    catalog_id: "catalog-main",
    auth_type: "centralized",
    sync_mode: "ifood_to_gestor",
    status: "configuring",
    catalog_sync_enabled: true,
    order_sync_enabled: false,
    import_images: true,
  });
});

test("confirma pedido iFood e atualiza status local", async () => {
  const state = {
    integration: { merchant_id: "merchant-1", order_sync_enabled: true },
    events: [{ id: "event-1" }],
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    order: {
      id: "order-1",
      restaurant_id: "restaurant-1",
      external_source: "ifood",
      external_order_id: "ifood-order-1",
      status: "pending",
    },
    integrationUpserts: [],
    orderUpdates: [],
  };
  const calls = [];
  const { POST } = loadRoute(ifoodActionRoutePath, state, {
    "@/lib/ifood/orders": {
      confirmIfoodOrder: async (orderId) => calls.push(["confirm", orderId]),
      dispatchIfoodOrder: async (orderId) => calls.push(["dispatch", orderId]),
      readyToPickupIfoodOrder: async (orderId) => calls.push(["ready", orderId]),
      getIfoodCancellationReasons: async () => [],
      requestIfoodOrderCancellation: async () => ({}),
    },
  });

  const response = await POST(jsonRequest({ orderId: "order-1", action: "confirm" }));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "preparing");
  assert.deepEqual(calls, [["confirm", "ifood-order-1"]]);
  assert.deepEqual(state.orderUpdates, [
    {
      payload: { status: "preparing" },
      filters: [{ column: "id", value: "order-1" }, { column: "restaurant_id", value: "restaurant-1" }],
    },
  ]);
});

test("bloqueia acao iFood quando o pedido nao pertence ao lojista", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: null,
    order: {
      id: "order-1",
      restaurant_id: "restaurant-2",
      external_source: "ifood",
      external_order_id: "ifood-order-1",
      status: "pending",
    },
    integrationUpserts: [],
    orderUpdates: [],
  };
  let confirmCalled = false;
  const { POST } = loadRoute(ifoodActionRoutePath, state, {
    "@/lib/ifood/orders": {
      confirmIfoodOrder: async () => {
        confirmCalled = true;
      },
      dispatchIfoodOrder: async () => {},
      readyToPickupIfoodOrder: async () => {},
      getIfoodCancellationReasons: async () => [],
      requestIfoodOrderCancellation: async () => ({}),
    },
  });

  const response = await POST(jsonRequest({ orderId: "order-1", action: "confirm" }));
  const body = await readJson(response);

  assert.equal(response.status, 403);
  assert.match(body.error, /acesso negado/i);
  assert.equal(confirmCalled, false);
  assert.equal(state.orderUpdates.length, 0);
});

test("sincroniza pedidos iFood para loja autorizada e habilita sync", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integration: { merchant_id: "merchant-1", status: "disconnected" },
    integrationUpserts: [],
    integrationUpdates: [],
    orderUpdates: [],
  };
  const calls = [];
  class IfoodApiError extends Error {}
  const { POST } = loadRoute(ifoodSyncRoutePath, state, {
    "@/lib/ifood/orders": { IfoodApiError },
    "@/lib/ifood/order-sync": {
      syncIfoodOrdersForRestaurant: async (args) => {
        calls.push(args);
        return {
          eventsReceived: 2,
          eventsProcessed: 2,
          eventsAcknowledged: 2,
          pendingEvents: 0,
        };
      },
    },
  });

  const response = await POST(jsonRequest({ restaurantId: "restaurant-1" }));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(calls, [
    {
      restaurantId: "restaurant-1",
      merchantId: "merchant-1",
      source: "manual",
    },
  ]);
  assert.deepEqual(state.integrationUpdates, [
    {
      payload: { order_sync_enabled: true, status: "configuring" },
      filters: [{ column: "restaurant_id", value: "restaurant-1" }, { column: "merchant_id", value: "merchant-1" }],
    },
  ]);
});

test("bloqueia sincronizacao iFood quando merchant nao esta configurado", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integration: { merchant_id: "", status: "configuring" },
    integrationUpserts: [],
    integrationUpdates: [],
    orderUpdates: [],
  };
  let syncCalled = false;
  class IfoodApiError extends Error {}
  const { POST } = loadRoute(ifoodSyncRoutePath, state, {
    "@/lib/ifood/orders": { IfoodApiError },
    "@/lib/ifood/order-sync": {
      syncIfoodOrdersForRestaurant: async () => {
        syncCalled = true;
      },
    },
  });

  const response = await POST(jsonRequest({ restaurantId: "restaurant-1" }));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(body.error, /merchant do iFood/i);
  assert.equal(syncCalled, false);
  assert.equal(state.integrationUpdates.length, 0);
});

test("lista eventos iFood apenas para pedido pertencente ao lojista", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    order: {
      id: "order-1",
      restaurant_id: "restaurant-1",
      external_source: "ifood",
      external_order_id: "ifood-order-1",
    },
    events: [
      {
        id: "event-row-1",
        ifood_event_id: "event-1",
        ifood_order_id: "ifood-order-1",
        event_code: "PLC",
        processed_at: "2026-07-02T10:00:00.000Z",
        acknowledged_at: "2026-07-02T10:01:00.000Z",
      },
    ],
    integrationUpserts: [],
    integrationUpdates: [],
    orderUpdates: [],
  };
  const { GET } = loadRoute(ifoodEventsRoutePath, state);

  const response = await GET(new Request("http://localhost/api/integrations/ifood/orders/events?orderId=order-1"));
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.events, state.events);
});

test("bloqueia listagem de eventos para pedido que nao e do iFood", async () => {
  const state = {
    user: { id: "user-1" },
    ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    order: {
      id: "order-1",
      restaurant_id: "restaurant-1",
      external_source: "manual",
      external_order_id: null,
    },
    events: [],
    integrationUpserts: [],
    integrationUpdates: [],
    orderUpdates: [],
  };
  const { GET } = loadRoute(ifoodEventsRoutePath, state);

  const response = await GET(new Request("http://localhost/api/integrations/ifood/orders/events?orderId=order-1"));
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(body.error, /iFood/i);
});

test("merchant duplicado bloqueia cadastro antes do OAuth e do catálogo", async () => {
  const state = {
    user: { id: "user-1" }, ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    bindings: [{ restaurant_id: "restaurant-2", merchant_id: "merchant-1" }],
    integrationUpserts: [], orderUpdates: [],
  };
  let upstreamCalls = 0;
  const { POST } = loadRoute(ifoodConnectionRoutePath, state, {
    "@/lib/ifood/catalog": {
      validateIfoodCredentials: async () => { upstreamCalls++; },
      listIfoodCatalogs: async () => { upstreamCalls++; return []; },
      pickMainCatalog: () => null,
    },
  });
  const response = await POST(jsonRequest({ restaurantId: "restaurant-1", merchantId: " MERCHANT-1 " }));
  assert.equal(response.status, 409);
  assert.equal(upstreamCalls, 0);
  assert.equal(state.integrationUpserts.length, 0);
  assert.doesNotMatch((await readJson(response)).error, /restaurant-2/);
});

test("polling manual não reativa merchant vinculado a duas lojas", async () => {
  const state = {
    user: { id: "user-1" }, ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integration: { merchant_id: "merchant-1", status: "configuring" },
    bindings: [{ restaurant_id: "restaurant-1", merchant_id: "merchant-1" }, { restaurant_id: "restaurant-2", merchant_id: "merchant-1" }],
    integrationUpdates: [],
  };
  let polling = 0;
  const { POST } = loadRoute(ifoodSyncRoutePath, state, {
    "@/lib/ifood/orders": { IfoodApiError: class extends Error {} },
    "@/lib/ifood/order-sync": { syncIfoodOrdersForRestaurant: async () => { polling++; } },
  });
  assert.equal((await POST(jsonRequest({ restaurantId: "restaurant-1" }))).status, 409);
  assert.equal(polling, 0);
  assert.equal(state.integrationUpdates.length, 0);
});

test("ação em pedido histórico de integração desabilitada não chama iFood", async () => {
  const state = {
    user: { id: "user-1" }, ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integration: { merchant_id: "merchant-1", order_sync_enabled: false },
    order: { id: "order-1", restaurant_id: "restaurant-1", external_source: "ifood", external_order_id: "external-1" },
    orderUpdates: [],
  };
  let calls = 0;
  const { POST } = loadRoute(ifoodActionRoutePath, state, {
    "@/lib/ifood/orders": { confirmIfoodOrder: async () => { calls++; } },
  });
  assert.equal((await POST(jsonRequest({ orderId: "order-1", action: "confirm" }))).status, 409);
  assert.equal(calls, 0);
  assert.equal(state.orderUpdates.length, 0);
});

test("visão Merchant sem vínculo não enumera lojas da aplicação centralizada", async () => {
  const state = { user: { id: "user-1" }, ownedRestaurant: { id: "restaurant-1", user_id: "user-1" } };
  const route = path.join(projectRoot, "src/app/api/integrations/ifood/merchant/route.ts");
  let calls = 0;
  const { POST } = loadRoute(route, state, {
    "@/lib/ifood/merchant": { listIfoodMerchants: async () => { calls++; return []; } },
  });
  const result = await POST(jsonRequest({ restaurantId: "restaurant-1", action: "overview" }));
  assert.equal(result.status, 200);
  assert.deepEqual((await readJson(result)).merchants, []);
  assert.equal(calls, 0);
});

test("visão Merchant recusa ID não vinculado antes de consultar iFood", async () => {
  const state = { user: { id: "user-1" }, ownedRestaurant: { id: "restaurant-1", user_id: "user-1" },
    integration: { merchant_id: "merchant-1" } };
  const route = path.join(projectRoot, "src/app/api/integrations/ifood/merchant/route.ts");
  let calls = 0;
  const { POST } = loadRoute(route, state, {
    "@/lib/ifood/merchant": { getIfoodMerchantDetails: async () => { calls++; return {}; },
      listIfoodMerchants: async () => { calls++; return []; } },
  });
  const result = await POST(jsonRequest({ restaurantId: "restaurant-1", merchantId: "merchant-2", action: "overview" }));
  assert.equal(result.status, 409);
  assert.equal(calls, 0);
});
