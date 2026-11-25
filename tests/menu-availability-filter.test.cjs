const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const filename = path.join(__dirname, "../src/features/menu/product-availability.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const instance = new Module(filename, module);
instance.filename = filename;
instance.paths = Module._nodeModulePaths(path.dirname(filename));
instance._compile(compiled, filename);
const { isMenuProductAvailable, matchesMenuAvailabilityFilter } = instance.exports;
const menu = fs.readFileSync(path.join(__dirname, "../src/app/admin/(painel)/menu/page.tsx"), "utf8");

test("public availability requires an explicitly active product and category", () => {
  assert.equal(isMenuProductAvailable({ is_active: true }, { is_active: true }), true);
  assert.equal(isMenuProductAvailable({ is_active: false }, { is_active: true }), false);
  assert.equal(isMenuProductAvailable({ is_active: true }, { is_active: false }), false);
  assert.equal(isMenuProductAvailable({ is_active: true }, { is_active: null }), false);
  assert.equal(isMenuProductAvailable({ is_active: null }, { is_active: true }), false);
  assert.equal(isMenuProductAvailable({ is_active: true }, undefined), false);
});

test("filter includes products hidden through a paused category", () => {
  const active = { is_active: true };
  const paused = { is_active: false };
  assert.equal(matchesMenuAvailabilityFilter(active, active, "all"), true);
  assert.equal(matchesMenuAvailabilityFilter(active, active, "available"), true);
  assert.equal(matchesMenuAvailabilityFilter(active, paused, "unavailable"), true);
  assert.equal(matchesMenuAvailabilityFilter(paused, active, "unavailable"), true);
  assert.equal(matchesMenuAvailabilityFilter(active, active, "unavailable"), false);
  assert.equal(matchesMenuAvailabilityFilter(paused, active, "available"), false);
});

test("catalog wires status filters to category contents and avoids hiding empty categories in all view", () => {
  assert.match(menu, /aria-label="Filtrar produtos por disponibilidade"/);
  assert.match(menu, /matchesMenuAvailabilityFilter\(product, category, availabilityFilter\)/);
  assert.match(menu, /availabilityFilter === "all" && !term/);
  assert.match(menu, /setAvailabilityFilter\("all"\)/);
});

test("both drag-and-drop paths are disabled during a partial filter", () => {
  assert.match(menu, /canReorderCategories = !searchTerm\.trim\(\) && availabilityFilter === "all"/);
  assert.match(menu, /if \(!canReorderCategories \|\| draggedCategoryIndex === null/);
  assert.match(menu, /if \(!startedOnFullList\) return/);
  assert.match(menu, /draggable=\{!isEditing && canReorderCategories\}/);
  assert.match(menu, /!isSavingProductOrder && availabilityFilter === "all"/);
});
