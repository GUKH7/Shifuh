const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const routePath = path.join(__dirname, "..", "src", "lib", "ifood", "order-sync.ts");

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
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.operation = null;
    this.payload = null;
  }

  select() {
    this.operation = this.operation || "select";
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === "ifood_sync_runs") {
      return Promise.resolve({ data: { id: "sync-run-1" }, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }

  resolve() {
    if (this.table === "ifood_order_events" && this.operation === "select") {
      return Promise.resolve({ data: this.state.existingEvents, error: null });
    }

    if (this.table === "ifood_order_events" && this.operation === "insert") {
      this.state.insertedEvents.push(...this.payload);
    }

    if (this.table === "ifood_order_events" && this.operation === "update") {
      this.state.eventUpdates.push(this.payload);
    }

    if (this.table === "orders" && this.operation === "insert") {
      this.state.insertedOrders.push(this.payload);
    }

    if (this.table === "order_items" && this.operation === "insert") {
      this.state.insertedItems.push(...this.payload);
    }

    if (this.table === "ifood_sync_runs" && this.operation === "update") {
      this.state.syncRunUpdates.push(this.payload);
    }

    return Promise.resolve({ data: null, error: null });
  }
}

function createAdminMock(state) {
  return {
    from: (table) => new QueryBuilder(table, state),
    rpc: async (name) => {
      assert.equal(name, "next_order_display_number");
      return { data: 12, error: null };
    },
  };
}

function loadOrderSync(state, ifoodMock) {
  const originalLoad = Module._load;
  const compiled = compileTs(routePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "@/lib/supabase/server") {
      return { createAdminClient: () => createAdminMock(state) };
    }

    if (request === "@/lib/ifood/orders") {
      return ifoodMock;
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

function createIfoodDetails(orderId) {
  return {
    id: orderId,
    displayId: "1234",
    orderType: "DELIVERY",
    orderTiming: "IMMEDIATE",
    customer: {
      name: "Cliente iFood",
      phone: { number: "11999999999" },
      documentNumber: "12345678900",
    },
    delivery: {
      deliveryAddress: {
        streetName: "Rua Teste",
        streetNumber: "10",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        postalCode: "01001000",
      },
    },
    items: [{ name: "Produto iFood", quantity: 1, unitPrice: 20 }],
    total: { subTotal: 20, deliveryFee: 5, orderAmount: 25, benefits: 0 },
    payments: { methods: [{ method: "CREDIT", type: "ONLINE" }] },
  };
}

test("envia ACK apenas para eventos iFood processados com sucesso", async () => {
  const originalConsoleError = console.error;
  const state = {
    existingEvents: [],
    insertedEvents: [],
    eventUpdates: [],
    insertedOrders: [],
    insertedItems: [],
    syncRunUpdates: [],
  };
  const acknowledged = [];
  const events = [
    {
      id: "event-ok",
      code: "PLC",
      fullCode: "PLACED",
      orderId: "order-ok",
      merchantId: "merchant-1",
      createdAt: "2026-06-22T10:00:00.000Z",
      metadata: { group: "ORDER_STATUS" },
    },
    {
      id: "event-fail",
      code: "PLC",
      fullCode: "PLACED",
      orderId: "order-fail",
      merchantId: "merchant-1",
      createdAt: "2026-06-22T10:01:00.000Z",
      metadata: { group: "ORDER_STATUS" },
    },
  ];
  const ifoodMock = {
    pollIfoodOrderEvents: async () => events,
    acknowledgeIfoodOrderEvents: async (eventIds) => {
      acknowledged.push(...eventIds);
    },
    getIfoodOrderDetails: async (orderId) => {
      if (orderId === "order-fail") {
        throw new Error("detalhes indisponiveis");
      }

      return createIfoodDetails(orderId);
    },
    mapIfoodEventCodeToStatus: () => "pending",
  };
  const { syncIfoodOrdersForRestaurant } = loadOrderSync(state, ifoodMock);

  console.error = () => {};

  try {
    const result = await syncIfoodOrdersForRestaurant({
      restaurantId: "restaurant-1",
      merchantId: "merchant-1",
      source: "cron",
    });

    assert.deepEqual(acknowledged, ["event-ok"]);
    assert.equal(result.eventsReceived, 2);
    assert.equal(result.eventsProcessed, 1);
    assert.equal(result.eventsAcknowledged, 1);
    assert.equal(result.pendingEvents, 1);
    assert.equal(state.insertedEvents.length, 2);
    assert.equal(state.insertedOrders.length, 1);
    assert.equal(state.syncRunUpdates.at(-1).events_acknowledged, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
