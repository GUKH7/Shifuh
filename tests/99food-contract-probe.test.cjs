const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTs(relPath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relPath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleInstance = new Module(filename, module);
  moduleInstance.filename = filename;
  moduleInstance.paths = Module._nodeModulePaths(path.dirname(filename));
  const previousLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    return previousLoad.call(this, name, parent, isMain);
  };
  try { moduleInstance._compile(code, filename); return moduleInstance.exports; }
  finally { Module._load = previousLoad; }
}

const envelope = loadTs("src/lib/marketplaces/order-envelope.ts");
const ingestion = loadTs("src/lib/marketplaces/event-ingestion.ts", {
  "./order-envelope": envelope,
});
const contract = loadTs("src/lib/99food/contract-probe.ts", {
  "../marketplaces/order-envelope": envelope,
  "../marketplaces/event-ingestion": ingestion,
});

const trusted = { restaurantId: "restaurant-A", merchantId: "merchant-A" };
const rawEvent = (changes = {}) => JSON.stringify({
  merchantId: trusted.merchantId,
  restaurantId: trusted.restaurantId,
  orderId: "order-A",
  eventId: "event-A",
  status: "pending",
  occurredAt: "2026-11-24T14:00:00Z",
  ...changes,
});
const req = (rawBody = rawEvent(), binding = trusted, headers = {}) => ({
  rawBody, binding, headers,
});
const verified = (merchantId = "merchant-A") => ({
  source: contract.FOOD99_CONTRACT_PROBE_VERSION,
  merchantId,
});
function fakeProbe(onCall = () => {}) {
  return {
    async verifyRaw({ rawBody }) {
      onCall("verify", rawBody);
      return verified();
    },
    async decodeVerified(rawBody) {
      onCall("decode", rawBody);
      const p = JSON.parse(rawBody);
      return {
        channel: "99food",
        restaurantId: p.restaurantId,
        externalOrderId: p.orderId,
        externalEventId: p.eventId,
        status: p.status,
        occurredAt: p.occurredAt,
      };
    },
  };
}
function recorder(outcome = "created") {
  const events = [];
  return {
    events,
    async applyAtomically(event) {
      events.push(event);
      return outcome;
    },
  };
}

test("contract probe verifies raw bytes before decoding and scoped persistence", async () => {
  const calls = [];
  const store = recorder();
  const adapter = fakeProbe(stage => calls.push(stage));
  const result = await contract.probe99FoodContractEvent(req(), adapter, {
    async applyAtomically(event) {
      calls.push("store");
      return store.applyAtomically(event);
    },
  });
  assert.equal(result, "created");
  assert.deepEqual(calls, ["verify", "decode", "store"]);
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].channel, "99food");
  assert.equal(store.events[0].restaurantId, "restaurant-A");
  assert.equal(store.events[0].externalEventId, "event-A");
});

test("cannot decode after verification failure, wrong merchant or unknown proof", async () => {
  const db = recorder();
  const decoded = [];
  const probe = fakeProbe(stage => decoded.push(stage));
  for (const authenticate of [
    async () => null,
    async () => verified("merchant-B"),
    async () => ({ ...verified(), source: "unknown-contract" }),
  ]) {
    await assert.rejects(
      contract.probe99FoodContractEvent(req(), { ...probe, verifyRaw: authenticate }, db),
      /authentication failed/,
    );
  }
  assert.equal(decoded.length, 0);
  assert.equal(db.events.length, 0);
});

test("normalization rejects a forged tenant, different channel and extra mapped fields", async () => {
  const db = recorder();
  const correct = fakeProbe();
  await assert.rejects(contract.probe99FoodContractEvent(
    req(rawEvent({ restaurantId: "restaurant-B" })), correct, db,
  ), /tenant\/channel mismatch/);
  await assert.rejects(contract.probe99FoodContractEvent(req(), {
    ...correct,
    decodeVerified: async () => ({
      channel: "ifood", restaurantId: "restaurant-A",
      externalOrderId: "order-A", externalEventId: "event-A",
      status: "pending", occurredAt: "2026-11-24T14:00:00Z",
    }),
  }, db), /tenant\/channel mismatch/);
  await assert.rejects(contract.probe99FoodContractEvent(req(), {
    ...correct,
    decodeVerified: async () => ({
      channel: "99food", restaurantId: "restaurant-A",
      externalOrderId: "order-A", externalEventId: "event-A",
      status: "pending", occurredAt: "2026-11-24T14:00:00Z",
      eventKey: "caller-forged-key",
    }),
  }, db), /invalid.*envelope/);
  assert.equal(db.events.length, 0);
});

test("untrusted large body, header injection, invalid binding and absent guards fail closed", async () => {
  const db = recorder();
  const verifier = fakeProbe();
  await assert.rejects(contract.probe99FoodContractEvent(
    req("ã".repeat(32769)), verifier, db,
  ), /invalid.*request/);
  await assert.rejects(contract.probe99FoodContractEvent(
    req(rawEvent(), trusted, { "x-test": "hi\r\nforged:1" }), verifier, db,
  ), /invalid.*headers/);
  await assert.rejects(contract.probe99FoodContractEvent(
    req(rawEvent(), { ...trusted, restaurantId: " restaurant-A" }), verifier, db,
  ), /invalid.*request/);
  await assert.rejects(contract.probe99FoodContractEvent(
    req(), { verifyRaw: null, decodeVerified: async () => ({}) }, db,
  ), /required/);
  assert.equal(db.events.length, 0);
});

test("mock order lifecycle deduplicates replays and refuses stale and terminal regressions", async () => {
  const seen = new Set();
  const orders = new Map();
  const store = {
    async applyAtomically(event, canTransition) {
      if (seen.has(event.eventKey)) return "duplicate";
      const previous = orders.get(event.orderKey) ?? null;
      if (!canTransition(previous, event.status)) {
        seen.add(event.eventKey);
        return "stale";
      }
      seen.add(event.eventKey);
      orders.set(event.orderKey, event.status);
      return previous === null ? "created" : "updated";
    },
  };
  const probe = fakeProbe();
  const send = (eventId, status, when) =>
    contract.probe99FoodContractEvent(req(rawEvent({
      eventId, status, occurredAt: when,
    })), probe, store);

  assert.equal(await send("evt1", "pending", "2026-11-24T14:00:00Z"), "created");
  assert.equal(await send("evt1", "pending", "2026-11-24T14:00:00Z"), "duplicate");
  assert.equal(await send("evt2", "preparing", "2026-11-24T14:01:00Z"), "updated");
  assert.equal(await send("evt3", "done", "2026-11-24T14:02:00Z"), "updated");
  assert.equal(await send("evt4", "pending", "2026-11-24T14:03:00Z"), "stale");
  assert.equal([...orders.values()][0], "done");
});

test("database outage propagates; never creates an upstream provider ACK", async () => {
  await assert.rejects(contract.probe99FoodContractEvent(req(), fakeProbe(), {
    async applyAtomically() { throw new Error("staging unavailable"); },
  }), /staging unavailable/);
});
