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

  in(field, ids) {
    if (field === "ifood_event_id") this.eventIds = ids;
    return this;
  }

  is() { return this; }
  abortSignal(signal) {
    this.signal = signal;
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
      if (this.state.failProcessedUpdate && this.payload?.processed_at) {
        return Promise.resolve({ data: null, error: { message: "database error" } });
      }
      if (this.payload?.acknowledged_at) {
        if (this.state.failAckUpdate) {
          return Promise.resolve({ data: null, error: { message: "lost database response" } });
        }
        const all = [...this.state.existingEvents, ...this.state.insertedEvents];
        const selected = all.filter((x) => this.eventIds?.includes(x.ifood_event_id) &&
          !x.acknowledged_at);
        const rows = this.state.zeroAckRows ? [] :
          this.state.partialAckRows ? selected.slice(0, 1) : selected;
        return Promise.resolve({ data: rows.map((x) => ({ ifood_event_id: x.ifood_event_id })), error: null });
      }
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
    rpc: async (name, args) => {
      assert.equal(name, "create_order_transaction");
      const orderId = `local-${state.insertedOrders.length + 1}`;
      state.insertedOrders.push({
        id: orderId,
        restaurant_id: args.p_restaurant_id,
        customer_name: args.p_customer_name,
        customer_phone: args.p_customer_phone,
        subtotal: args.p_subtotal,
        delivery_fee: args.p_delivery_fee,
        discount: args.p_discount,
        total: args.p_total,
        status: args.p_status,
        payment_method: args.p_payment_method,
        change_for: args.p_change_for,
        address: args.p_address,
        display_number: state.insertedOrders.length + 1,
        external_source: args.p_external_source,
        external_order_id: args.p_external_order_id,
        external_display_id: args.p_external_display_id,
        is_test: args.p_is_test,
        external_payload: args.p_external_payload,
      });
      state.insertedItems.push(
        ...args.p_items.map((item) => ({
          order_id: orderId,
          ...item,
        })),
      );

      return { data: [{ order_id: orderId, display_number: state.insertedOrders.length }], error: null };
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


test("não confirma evento ao iFood quando gravação de processed_at falha", async () => {
  const originalConsoleError = console.error;
  const state = {
    existingEvents: [],
    insertedEvents: [],
    eventUpdates: [],
    insertedOrders: [],
    insertedItems: [],
    syncRunUpdates: [],
    failProcessedUpdate: true,
  };
  const acknowledged = [];
  const ifoodMock = {
    pollIfoodOrderEvents: async () => [{
      id: "event-db-fail", code: "PLC", orderId: "order-db-fail",
      merchantId: "merchant-1", createdAt: "2026-10-24T08:00:00Z",
    }],
    getIfoodOrderDetails: async (id) => createIfoodDetails(id),
    acknowledgeIfoodOrderEvents: async (ids) => acknowledged.push(...ids),
    mapIfoodEventCodeToStatus: () => "pending",
  };
  console.error = () => {};
  try {
    const { syncIfoodOrdersForRestaurant } = loadOrderSync(state, ifoodMock);
    const result = await syncIfoodOrdersForRestaurant({
      restaurantId: "restaurant-1", merchantId: "merchant-1", source: "cron",
    });
    assert.deepEqual(acknowledged, []);
    assert.equal(result.eventsProcessed, 0);
    assert.equal(result.pendingEvents, 1);
    assert.deepEqual(result.failedEventIds, ["event-db-fail"]);
    assert.equal(state.insertedOrders.length, 1, "pedido ainda pode ter sido persistido");
  } finally {
    console.error = originalConsoleError;
  }
});

test("não esgota retries de eventos por indisponibilidade HTTP 504 do iFood", async () => {
  const originalConsoleError = console.error;
  const state = {
    existingEvents: [], insertedEvents: [], eventUpdates: [],
    insertedOrders: [], insertedItems: [], syncRunUpdates: [],
  };
  const acknowledged = [];
  const upstreamError = Object.assign(new Error("upstream 504"), { status: 504, retryAfterMs: 120_000 });
  const ifoodMock = {
    pollIfoodOrderEvents: async () => [{
      id: "event-upstream-fail", code: "PLC", orderId: "order-upstream-fail",
      merchantId: "merchant-1", createdAt: "2026-10-24T08:00:00Z",
    }],
    getIfoodOrderDetails: async () => { throw upstreamError; },
    acknowledgeIfoodOrderEvents: async ids => acknowledged.push(...ids),
    mapIfoodEventCodeToStatus: () => "pending",
  };
  console.error = () => {};
  try {
    const { syncIfoodOrdersForRestaurant } = loadOrderSync(state, ifoodMock);
    const result = await syncIfoodOrdersForRestaurant({
      restaurantId: "restaurant-1", merchantId: "merchant-1", source: "cron",
    });
    assert.equal(result.pendingEvents, 1);
    assert.deepEqual(result.failedEventIds, [], "sem tentativas cobradas à fila por 504 externo");
    assert.equal(result.upstreamRetryAfterMs, 120_000);
    assert.deepEqual(acknowledged, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test("legacy ACK: update of zero rows fails closed after an accepted provider response", async () => {
  const state = { existingEvents: [], insertedEvents: [], eventUpdates: [],
    insertedOrders: [], insertedItems: [], syncRunUpdates: [], zeroAckRows: true };
  let sends = 0;
  const events = [{ id:"ack-zero", code:"PLC", orderId:"order-zero", merchantId:"merchant-1" }];
  const mock = { pollIfoodOrderEvents: async () => events,
    getIfoodOrderDetails: async (id) => createIfoodDetails(id),
    acknowledgeIfoodOrderEvents: async () => { sends++; },
    mapIfoodEventCodeToStatus: () => "pending" };
  const { syncIfoodOrdersForRestaurant } = loadOrderSync(state, mock);
  await assert.rejects(syncIfoodOrdersForRestaurant({
    restaurantId:"restaurant-1",merchantId:"merchant-1",source:"manual"
  }), /confirmação local incompleta ou ambígua/);
  assert.equal(sends, 1);
  assert.equal(state.syncRunUpdates.at(-1).events_acknowledged, undefined);
});

test("legacy ACK: lost database response is never counted as successful", async () => {
  const state = { existingEvents: [], insertedEvents: [], eventUpdates: [],
    insertedOrders: [], insertedItems: [], syncRunUpdates: [], failAckUpdate: true };
  let sends = 0;
  const mock = { pollIfoodOrderEvents: async () =>
    [{ id:"ack-ambiguous", code:"PLC", orderId:"order-ambiguous", merchantId:"merchant-1" }],
    getIfoodOrderDetails: async (id) => createIfoodDetails(id),
    acknowledgeIfoodOrderEvents: async () => { sends++; },
    mapIfoodEventCodeToStatus: () => "pending" };
  await assert.rejects(loadOrderSync(state, mock).syncIfoodOrdersForRestaurant({
    restaurantId:"restaurant-1",merchantId:"merchant-1",source:"manual"
  }), /confirmação local incompleta ou ambígua/);
  assert.equal(sends, 1);
});

test("legacy polling does not resend ACK for a durably acknowledged event", async () => {
  const state = { existingEvents: [{ ifood_event_id:"already-acknowledged",
    processed_at:"2026-10-26T10:00:00Z",acknowledged_at:"2026-10-26T10:01:00Z" }],
    insertedEvents: [],eventUpdates: [],insertedOrders: [],insertedItems: [],syncRunUpdates: [] };
  let sends=0;
  const mock = { pollIfoodOrderEvents: async () =>
    [{ id:"already-acknowledged",code:"PLC",orderId:"already-ordered",merchantId:"merchant-1" }],
    getIfoodOrderDetails: async () => { throw Error("unexpected details call"); },
    acknowledgeIfoodOrderEvents: async () => { sends++; },
    mapIfoodEventCodeToStatus: () => "pending" };
  const summary=await loadOrderSync(state,mock).syncIfoodOrdersForRestaurant({
    restaurantId:"restaurant-1",merchantId:"merchant-1",source:"manual"
  });
  assert.equal(summary.eventsAcknowledged,0);
  assert.equal(sends,0);
});
