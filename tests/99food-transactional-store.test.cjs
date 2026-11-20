const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(filePath, imports = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  const originalLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
    return originalLoad.call(this, name, parent, isMain);
  };
  try {
    loaded._compile(code, filePath);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const envelope = loadTs(path.join(__dirname, "../src/lib/marketplaces/order-envelope.ts"));
const store = loadTs(path.join(__dirname, "../src/lib/99food/transactional-store.ts"), {
  "../marketplaces/order-envelope": envelope,
});
const input = {
  channel: "99food",
  restaurantId: "restaurant-A",
  externalOrderId: "order-1",
  externalEventId: "event-1",
  status: "pending",
  occurredAt: "2026-11-19T12:00:00Z",
};
const validEvent = () => envelope.normalizeMarketplaceOrderEvent(input);
const binding = { restaurantId: "restaurant-A", merchantId: "99food-merchant-A" };

test("99Food staged store sends scoped, normalized RPC arguments", async () => {
  const calls = [];
  const s = store.create99FoodLocalTransactionalStore(async (...args) => {
    calls.push(args);
    return { data: "created", error: null };
  }, binding);
  assert.equal(await s.applyAtomically(validEvent(), () => true), "created");
  assert.equal(calls[0][0], "ingest_99food_staged_event");
  assert.deepEqual(calls[0][1], {
    p_restaurant_id: binding.restaurantId,
    p_merchant_id: binding.merchantId,
    p_external_order_id: "order-1",
    p_external_event_id: "event-1",
    p_status: "pending",
    p_occurred_at: "2026-11-19T12:00:00.000Z",
  });
});

test("99Food staging refuses different tenant/channel and forged identity keys", async () => {
  let calls = 0;
  const rpc = async () => { calls++; return { data: "created", error: null }; };
  const s = store.create99FoodLocalTransactionalStore(rpc, binding);
  const wrongTenant = envelope.normalizeMarketplaceOrderEvent({ ...input, restaurantId: "restaurant-B" });
  const ifood = envelope.normalizeMarketplaceOrderEvent({ ...input, channel: "ifood" });
  await assert.rejects(s.applyAtomically(wrongTenant, () => true), /scope mismatch/);
  await assert.rejects(s.applyAtomically(ifood, () => true), /scope mismatch/);
  await assert.rejects(s.applyAtomically({ ...validEvent(), eventKey: "forged" }, () => true), /scope mismatch/);
  assert.equal(calls, 0);
});

test("database errors and unexpected RPC responses fail closed, never ACK", async () => {
  const failure = store.create99FoodLocalTransactionalStore(async () => ({
    data: null, error: { message: "simulated outage" },
  }), binding);
  await assert.rejects(failure.applyAtomically(validEvent(), () => true), /persistence failed/);

  const invalid = store.create99FoodLocalTransactionalStore(async () => ({
    data: "acknowledged", error: null,
  }), binding);
  await assert.rejects(invalid.applyAtomically(validEvent(), () => true), /invalid.*outcome/);
});

test("requires server-resolved merchant binding", () => {
  assert.throws(() => store.create99FoodLocalTransactionalStore(async () => ({}), {
    restaurantId: "restaurant-A", merchantId: "",
  }), /binding/);
});
