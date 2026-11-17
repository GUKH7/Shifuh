const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(filePath, mockImports = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleInstance = new Module(filePath, module);
  moduleInstance.filename = filePath;
  moduleInstance.paths = Module._nodeModulePaths(path.dirname(filePath));
  const originalLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mockImports, name)) return mockImports[name];
    return originalLoad.call(this, name, parent, isMain);
  };
  try {
    moduleInstance._compile(code, filePath);
    return moduleInstance.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const envelope = loadTs(path.join(__dirname, "../src/lib/marketplaces/order-envelope.ts"));
const adapter = loadTs(path.join(__dirname, "../src/lib/99food/sandbox-adapter.ts"), {
  "../marketplaces/order-envelope": envelope,
});
const ingestion = loadTs(path.join(__dirname, "../src/lib/marketplaces/event-ingestion.ts"), {
  "./order-envelope": envelope,
});

const ctxA = { restaurantId: "restaurant-A", merchantId: "merchant-A" };
const ctxB = { restaurantId: "restaurant-B", merchantId: "merchant-B" };
const fixture = (overrides = {}) => ({
  fixtureVersion: "shifuh-99food-sandbox-v1",
  merchantId: "merchant-A",
  orderId: "same-order",
  eventId: "same-event",
  state: "NEW",
  happenedAt: "2026-11-16T13:00:00Z",
  ...overrides,
});

/** Pure in-memory transaction simulator. NEVER a production storage implementation. */
function createAtomicMockStore() {
  const events = new Map();
  const orders = new Map();
  let lock = Promise.resolve();
  let operations = 0;

  return {
    events, orders,
    get operations() { return operations; },
    applyAtomically(event, canTransition) {
      // Shared promise queue simulates one transaction per operation even
      // when independent workers send the same event concurrently.
      const work = lock.then(async () => {
        operations++;
        const existing = events.get(event.eventKey);
        if (existing) {
          if (existing.orderKey !== event.orderKey || existing.status !== event.status ||
              existing.occurredAt !== event.occurredAt) {
            throw new Error("conflicting persisted event");
          }
          return "duplicate";
        }
        const current = orders.get(event.orderKey) || null;
        const result = current === null ? "created" :
          canTransition(current.status, event.status) ? "updated" : "stale";
        // Record stale events as processed so duplicates are also idempotent.
        events.set(event.eventKey, event);
        if (result === "created" || result === "updated") {
          orders.set(event.orderKey, { status: event.status, restaurantId: event.restaurantId });
        }
        return result;
      });
      lock = work.catch(() => {});
      return work;
    },
  };
}

test("99Food mock adapter accepts a supported synthetic event and maps state", () => {
  const parsed = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  assert.equal(parsed.channel, "99food");
  assert.equal(parsed.restaurantId, "restaurant-A");
  assert.equal(parsed.status, "pending");
  assert.equal(parsed.occurredAt, "2026-11-16T13:00:00.000Z");
  assert.equal(adapter.adapt99FoodSandboxFixture(fixture({ state: "COMPLETED" }), ctxA).status, "done");
  assert.equal(adapter.adapt99FoodSandboxFixture(fixture({ state: "CANCELLED" }), ctxA).status, "canceled");
});

test("rejects fake/unknown native payloads, merchant mismatch, malformed timestamps", () => {
  assert.throws(() => adapter.adapt99FoodSandboxFixture({ orderId: "123" }, ctxA), /unsupported/);
  assert.throws(() => adapter.adapt99FoodSandboxFixture(fixture({ merchantId: "merchant-B" }), ctxA), /binding mismatch/);
  assert.throws(() => adapter.adapt99FoodSandboxFixture(fixture({ state: "EXECUTE" }), ctxA), /unsupported/);
  assert.throws(() => adapter.adapt99FoodSandboxFixture(fixture({ happenedAt: "not a timestamp" }), ctxA), /timezone/);
  assert.throws(() => adapter.adapt99FoodSandboxFixture(fixture({ restaurantId: "spoofed" }), ctxA), /unknown/);
  assert.throws(() => adapter.adapt99FoodSandboxFixture(fixture({ orderId: "" }), ctxA), /invalid/);
});

test("batch deduplicates safely and rejects conflicting duplicated event IDs", () => {
  const batch = adapter.adapt99FoodSandboxBatch([fixture(), fixture(), fixture({ eventId: "other" })], ctxA);
  assert.equal(batch.events.length, 2);
  assert.equal(batch.duplicates, 1);
  assert.throws(
    () => adapter.adapt99FoodSandboxBatch([fixture(), fixture({ state: "COMPLETED" })], ctxA),
    /conflicting/,
  );
  assert.throws(() => adapter.adapt99FoodSandboxBatch(Array(501).fill(fixture()), ctxA), /invalid/);
});

test("concurrent duplicate delivery creates one record (atomic storage mock)", async () => {
  const store = createAtomicMockStore();
  const event = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  const outcomes = await Promise.all(Array.from({ length: 30 }, () => ingestion.ingestMarketplaceEvent(event, store)));
  assert.equal(outcomes.filter((result) => result === "created").length, 1);
  assert.equal(outcomes.filter((result) => result === "duplicate").length, 29);
  assert.equal(store.orders.size, 1);
  assert.equal(store.events.size, 1);
});

test("two restaurants sharing provider order/event IDs are isolated", async () => {
  const store = createAtomicMockStore();
  const a = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  const b = adapter.adapt99FoodSandboxFixture(fixture({ merchantId: "merchant-B" }), ctxB);
  const outcomes = await Promise.all([
    ingestion.ingestMarketplaceEvent(a, store),
    ingestion.ingestMarketplaceEvent(b, store),
  ]);
  assert.deepEqual(outcomes, ["created", "created"]);
  assert.equal(store.orders.size, 2);
  assert.equal(store.events.size, 2);
  assert.notEqual(a.eventKey, b.eventKey);
});

test("iFood existing channel identity remains distinct from 99Food", async () => {
  const store = createAtomicMockStore();
  const food99 = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  const ifood = envelope.normalizeMarketplaceOrderEvent({
    channel: "ifood",
    restaurantId: "restaurant-A",
    externalOrderId: "same-order",
    externalEventId: "same-event",
    status: "pending",
    occurredAt: "2026-11-16T13:00:00Z",
  });
  assert.deepEqual(await Promise.all([
    ingestion.ingestMarketplaceEvent(food99, store),
    ingestion.ingestMarketplaceEvent(ifood, store),
  ]), ["created", "created"]);
  assert.equal(store.orders.size, 2);
});

test("stale updates cannot revert a terminal order, and redelivery stays idempotent", async () => {
  const store = createAtomicMockStore();
  const pending = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  const done = adapter.adapt99FoodSandboxFixture(fixture({
    eventId: "done-event", state: "COMPLETED", happenedAt: "2026-11-16T13:05:00Z",
  }), ctxA);
  const late = adapter.adapt99FoodSandboxFixture(fixture({
    eventId: "late-event", state: "ACCEPTED", happenedAt: "2026-11-16T13:02:00Z",
  }), ctxA);
  assert.equal(await ingestion.ingestMarketplaceEvent(pending, store), "created");
  assert.equal(await ingestion.ingestMarketplaceEvent(done, store), "updated");
  assert.equal(await ingestion.ingestMarketplaceEvent(late, store), "stale");
  assert.equal(await ingestion.ingestMarketplaceEvent(late, store), "duplicate");
  assert.equal(store.orders.get(pending.orderKey).status, "done");
});

test("failure of atomic store propagates; never acknowledges or loses an event", async () => {
  const data = adapter.adapt99FoodSandboxFixture(fixture(), ctxA);
  const failure = { applyAtomically: async () => { throw new Error("simulated database outage"); } };
  await assert.rejects(ingestion.ingestMarketplaceEvent(data, failure), /outage/);
});
