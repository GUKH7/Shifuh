const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const menu = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "admin", "(painel)", "menu", "page.tsx"),
  "utf8",
);

test("menu loading state is centered in the available panel viewport", () => {
  assert.match(menu, /min-h-\[calc\(100dvh-7\.5rem\)\] items-center justify-center/);
  assert.match(menu, /role="status" aria-live="polite"/);
  assert.match(menu, /Carregando cardápio\.\.\./);
  assert.doesNotMatch(menu, /flex h-64 items-center justify-center/);
});

test("menu search icon stays vertically centered inside a fixed-height field", () => {
  assert.match(menu, /absolute left-4 top-1\/2 -translate-y-1\/2 text-gray-400/);
  assert.match(menu, /<Search size=\{16\} \/>/);
  assert.match(menu, /className="h-12 w-full rounded-2xl/);
  assert.doesNotMatch(menu, /absolute inset-y-0 left-0 flex w-11 items-center justify-center/);
});
