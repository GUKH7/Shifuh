const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");

const filename = path.join(__dirname, "../src/lib/marketplaces/order-envelope.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const instance = new Module(filename, module);
instance.filename = filename;
instance.paths = Module._nodeModulePaths(path.dirname(filename));
instance._compile(compiled, filename);

const { normalizeMarketplaceOrderEvent, normalizeMarketplaceEventBatch, shouldApplyMarketplaceStatus } = instance.exports;
function event(channel, overrides = {}) {
  return {
    channel, restaurantId: "restaurant-1", externalOrderId: "order-1",
    externalEventId: "event-1", status: "pending",
    occurredAt: "2026-11-16T10:00:00-03:00",
    ...overrides,
  };
}

test("normaliza pedidos internos de iFood e 99Food preservando o canal", () => {
  const ifood = normalizeMarketplaceOrderEvent(event("ifood"));
  const food99 = normalizeMarketplaceOrderEvent(event("99food"));
  assert.notEqual(ifood.eventKey, food99.eventKey);
  assert.notEqual(ifood.orderKey, food99.orderKey);
  assert.equal(ifood.occurredAt, "2026-11-16T13:00:00.000Z");
  assert.equal(food99.channel, "99food");
});

test("identidade de evento e pedido é isolada por restaurante e por tipo", () => {
  const a = normalizeMarketplaceOrderEvent(event("99food", { restaurantId: "x:y", externalEventId: "z" }));
  const b = normalizeMarketplaceOrderEvent(event("99food", { restaurantId: "x", externalEventId: "y:z" }));
  assert.notEqual(a.eventKey, b.eventKey);
  const c = normalizeMarketplaceOrderEvent(event("99food", { restaurantId: "restaurant-2" }));
  assert.notEqual(a.orderKey, c.orderKey);
});

test("elimina entrega duplicada dentro do lote, sem esconder conflitos", () => {
  const same = event("ifood");
  const normalized = normalizeMarketplaceEventBatch([same, { ...same }, event("99food")]);
  assert.equal(normalized.events.length, 2);
  assert.equal(normalized.duplicates, 1);
  assert.throws(() => normalizeMarketplaceEventBatch([same, { ...same, status: "done" }]), /conflicting/);
  assert.throws(() => normalizeMarketplaceEventBatch([same, { ...same, externalOrderId: "other" }]), /conflicting/);
});

test("rejeita eventos malformados e limita o tamanho do lote", () => {
  assert.throws(() => normalizeMarketplaceOrderEvent(event("unknown")), /unsupported/);
  assert.throws(() => normalizeMarketplaceOrderEvent(event("ifood", { restaurantId: " " })), /invalid/);
  assert.throws(() => normalizeMarketplaceOrderEvent(event("ifood", { externalEventId: "a\nb" })), /invalid/);
  assert.throws(() => normalizeMarketplaceOrderEvent(event("ifood", { occurredAt: "2026-11-16T10:00:00" })), /timezone/);
  assert.throws(() => normalizeMarketplaceOrderEvent(event("ifood", { status: "unknown" })), /unsupported/);
  assert.throws(() => normalizeMarketplaceEventBatch(Array.from({ length: 501 }, () => event("ifood"))), /too large/);
});

test("não reabre pedidos concluídos ou cancelados com eventos atrasados", () => {
  assert.equal(shouldApplyMarketplaceStatus("done", "pending"), false);
  assert.equal(shouldApplyMarketplaceStatus("canceled", "preparing"), false);
  assert.equal(shouldApplyMarketplaceStatus("preparing", "pending"), false);
  assert.equal(shouldApplyMarketplaceStatus("pending", "preparing"), true);
  assert.equal(shouldApplyMarketplaceStatus("delivering", "canceled"), true);
  assert.equal(shouldApplyMarketplaceStatus(null, "pending"), true);
});
