"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const vm = require("node:vm");

// Load only the pure reconciliation module and its pure local helpers.
function loadTs(relativePath) {
  const filename = path.join(__dirname, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolved = path.join(path.dirname(relativePath), specifier + ".ts");
      return loadTs(resolved);
    }
    return require(specifier);
  };
  vm.runInThisContext("(function(module, exports, require) { " + compiled + "\n})", { filename })(
    mod, mod.exports, localRequire,
  );
  return mod.exports;
}

const { reconcilePersistedCart } = loadTs("src/features/storefront/cart-reconciliation.ts");
const base = {
  id: "active", name: "Produto atualizado", description: "", price: 20,
  category_id: "category", image_url: "", is_active: true,
  addons: [{ id: "side", title: "Acompanhamento", required: true, min_options: 1,
    max_options: 1, options: [{ name: "Arroz", price: 3 }] }],
};
const item = (product, selectedAddons, totalPrice = 1, quantity = 2) => ({
  internalId: "saved-1", product, selectedAddons, totalPrice, quantity, observation: "Sem sal",
});

test("replaces persisted base and addon prices with the latest catalog prices", () => {
  const saved = item({ ...base, price: 1 }, [{ groupId: "side", name: "Arroz", price: 0 }], 2);
  const result = reconcilePersistedCart([saved], [base]);
  assert.equal(result.removedCount, 0);
  assert.equal(result.repricedCount, 1);
  assert.equal(result.items[0].totalPrice, 46);
  assert.equal(result.items[0].product.price, 20);
  assert.equal(result.items[0].selectedAddons[0].price, 3);
  assert.equal(result.items[0].observation, "Sem sal");
});

test("removes paused products and missing required addons", () => {
  const valid = item(base, [{ groupId: "side", name: "Arroz", price: 3 }], 46);
  const invalid = item({ ...base, id: "paused", is_active: true }, [], 30);
  const result = reconcilePersistedCart([valid, invalid, item(base, [], 40)], [base]);
  assert.equal(result.removedCount, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.repricedCount, 0);
});

test("rejects removed, ambiguous, duplicated or excessive addons and tampered quantities", () => {
  const options = [{ groupId: "side", name: "Arroz", price: 3 }];
  const invalid = [
    item(base, [{ groupId: "side", name: "Removido", price: 0 }]),
    item(base, [...options, ...options]),
    item(base, options, 10, -1),
    item(base, options, 10, Number.NaN),
    item(base, options, 10, 1000),
  ];
  const result = reconcilePersistedCart(invalid, [base]);
  assert.equal(result.items.length, 0);
  assert.equal(result.removedCount, invalid.length);
});

test("supports legacy options without groupId only when unambiguous", () => {
  const result = reconcilePersistedCart([item(base, [{ name: "Arroz", price: 1 }])], [base]);
  assert.equal(result.removedCount, 0);
  assert.equal(result.items[0].selectedAddons[0].groupId, "side");
  const ambiguous = { ...base, addons: [...base.addons, {
    id: "other", required: false, options: [{ name: "Arroz", price: 4 }],
  }] };
  assert.equal(reconcilePersistedCart([item(base, [{ name: "Arroz", price: 1 }])], [ambiguous]).removedCount, 1);
});

test("returns empty cart safely for malformed storage", () => {
  assert.deepEqual(reconcilePersistedCart({ items: [] }, [base]).items, []);
  assert.equal(reconcilePersistedCart([null, { product: null }], [base]).removedCount, 2);
});
