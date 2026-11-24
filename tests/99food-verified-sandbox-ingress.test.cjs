const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(relPath, mockImports = {}) {
  const filename = path.resolve(__dirname, "..", relPath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const oldLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mockImports, name)) return mockImports[name];
    return oldLoad.call(this, name, parent, isMain);
  };
  try { mod._compile(code, filename); return mod.exports; }
  finally { Module._load = oldLoad; }
}
const envelope = loadTs("src/lib/marketplaces/order-envelope.ts");
const adapter = loadTs("src/lib/99food/sandbox-adapter.ts", {
  "../marketplaces/order-envelope": envelope,
});
const ingestion = loadTs("src/lib/marketplaces/event-ingestion.ts", {
  "./order-envelope": envelope,
});
const ingress = loadTs("src/lib/99food/verified-sandbox-ingress.ts", {
  "./sandbox-adapter": adapter,
  "../marketplaces/event-ingestion": ingestion,
});
const context = { restaurantId: "restaurant-A", merchantId: "merchant-A" };
const body = (overrides = {}) => JSON.stringify({
  fixtureVersion: "shifuh-99food-sandbox-v1",
  merchantId: "merchant-A",
  orderId: "order-1",
  eventId: "event-1",
  state: "NEW",
  happenedAt: "2026-11-24T12:00:00Z",
  ...overrides,
});
function setup(rawBody = body(), ctx = context) {
  return { rawBody, headers: { "x-local-sandbox": "fixture" }, context: ctx };
}
function mockStore() {
  const calls = [];
  return { calls, applyAtomically: async event => { calls.push(event); return "created"; } };
}
const trusted = async () => ({ verified: true, merchantId: "merchant-A" });

test("verified synthetic event persists one scoped normalized event", async () => {
  const db = mockStore();
  const result = await ingress.ingestVerified99FoodSandboxEvent(setup(), trusted, db);
  assert.equal(result, "created");
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].channel, "99food");
  assert.equal(db.calls[0].restaurantId, "restaurant-A");
  assert.equal(db.calls[0].externalOrderId, "order-1");
});

test("rejects unauthenticated and mismatched identities before storage", async () => {
  const db = mockStore();
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), async () => null, db), /authentication failed/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), async () => ({ verified: false, merchantId: "merchant-A" }), db), /authentication failed/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), async () => ({ verified: true, merchantId: "merchant-B" }), db), /authentication failed/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(body({ merchantId: "merchant-B" })), trusted, db), /binding mismatch/);
  assert.equal(db.calls.length, 0);
});

test("verifier failure never parses or persists", async () => {
  const db = mockStore();
  const verifier = async () => { throw new Error("synthetic signature invalid"); };
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup("{not-json"), verifier, db), /synthetic signature invalid/);
  assert.equal(db.calls.length, 0);
});

test("rejects unknown provider payload, malformed JSON and oversized fixture", async () => {
  const db = mockStore();
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup('{"unknown":true}'), trusted, db), /unsupported 99Food sandbox fixture/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup("{not-json"), trusted, db), /invalid 99Food sandbox JSON/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup("x".repeat(65537)), trusted, db), /invalid 99Food sandbox ingress/);
  assert.equal(db.calls.length, 0);
});

test("database outage is propagated, not converted into ACK", async () => {
  const store = { applyAtomically: async () => { throw new Error("database offline"); } };
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), trusted, store), /database offline/);
});

test("without verifier or transactional store there is no fallback", async () => {
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), null, mockStore()), /required/);
  await assert.rejects(ingress.ingestVerified99FoodSandboxEvent(setup(), trusted, null), /required/);
});
