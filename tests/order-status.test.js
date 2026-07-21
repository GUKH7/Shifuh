const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");

const projectRoot = path.join(__dirname, "..");
const routePath = path.join(projectRoot, "src", "app", "api", "orders", "[id]", "status", "route.ts");

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
    this.filters = [];
    this.payload = null;
  }

  select() {
    return this;
  }

  update(payload) {
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    if (this.table === "orders") {
      return Promise.resolve({ data: this.state.order, error: this.state.orderError || null });
    }

    if (this.table === "restaurants") {
      const userId = this.filters.find((filter) => filter.column === "user_id")?.value;
      const restaurant = userId === this.state.user.id ? this.state.restaurant : null;

      return Promise.resolve({ data: restaurant, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  then(resolve, reject) {
    if (this.table === "orders" && this.payload) {
      this.state.orderUpdates.push({
        payload: this.payload,
        filters: this.filters,
      });
    }

    return Promise.resolve({ data: null, error: this.state.updateError || null }).then(resolve, reject);
  }
}

function createSupabaseMock(state) {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user || null }, error: null }),
    },
    from: (table) => new QueryBuilder(table, state),
  };
}

function loadRoute(state, aliases = {}) {
  const originalLoad = Module._load;
  const compiled = compileTs(routePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(aliases, request)) {
      return aliases[request];
    }

    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    }

    if (request === "@/lib/supabase/server") {
      return { createClient: async () => createSupabaseMock(state) };
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

function baseState() {
  return {
    user: { id: "user-1" },
    restaurant: { id: "restaurant-1", user_id: "user-1", name: "Loja Teste" },
    order: {
      id: "order-1",
      restaurant_id: "restaurant-1",
      customer_name: "Cliente Teste",
      customer_phone: "11999999999",
      status: "pending",
      display_number: 27,
    },
    orderUpdates: [],
  };
}

test("atualiza status e envia mensagem limpa pelo WhatsApp", async () => {
  const state = baseState();
  const sentMessages = [];
  const { PATCH } = loadRoute(state, {
    "@/lib/whatsapp-bot": {
      sendWhatsappMessage: async (payload) => {
        sentMessages.push(payload);
        return { ok: true, skipped: false };
      },
    },
  });

  const response = await PATCH(
    new Request("http://local.test/api/orders/order-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "preparing" }),
    }),
    { params: Promise.resolve({ id: "order-1" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.order.status, "preparing");
  assert.deepEqual(state.orderUpdates[0].payload, { status: "preparing" });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].message.includes("Seu pedido #0027 está em preparo."), true);
  assert.equal(sentMessages[0].message.includes("Ã"), false);
});

test("permite atualizar status sem notificar cliente", async () => {
  const state = baseState();
  let sendCalled = false;
  const { PATCH } = loadRoute(state, {
    "@/lib/whatsapp-bot": {
      sendWhatsappMessage: async () => {
        sendCalled = true;
        return { ok: true, skipped: false };
      },
    },
  });

  const response = await PATCH(
    new Request("http://local.test/api/orders/order-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "delivering", notifyCustomer: false }),
    }),
    { params: Promise.resolve({ id: "order-1" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notification.skipped, true);
  assert.equal(sendCalled, false);
});

test("exige motivo ao cancelar e inclui a orientação na mensagem", async () => {
  const state = baseState();
  const sentMessages = [];
  const { PATCH } = loadRoute(state, {
    "@/lib/whatsapp-bot": {
      sendWhatsappMessage: async (payload) => {
        sentMessages.push(payload);
        return { ok: true, skipped: false };
      },
    },
  });

  const invalidResponse = await PATCH(
    new Request("http://local.test/api/orders/order-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "canceled" }),
    }),
    { params: Promise.resolve({ id: "order-1" }) },
  );
  assert.equal(invalidResponse.status, 400);

  const response = await PATCH(
    new Request("http://local.test/api/orders/order-1/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "canceled", cancellationReason: "Item indisponível" }),
    }),
    { params: Promise.resolve({ id: "order-1" }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(state.orderUpdates[0].payload, {
    status: "canceled",
    cancellation_reason: "Item indisponível",
  });
  assert.match(sentMessages[0].message, /Motivo: Item indisponível/);
});
