const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

test("resumo de pedidos usa a mesma largura máxima dos containers principais", () => {
  assert.match(globals, /section\.fixed:has\(> button\[aria-expanded\]\)/);
  assert.match(globals, /left: calc\(var\(--admin-sidebar-width\) \+ 1\.5rem\)/);
  assert.match(globals, /right: auto/);
  assert.match(globals, /width: min\(1460px, calc\(100vw - var\(--admin-sidebar-width\) - 3rem\)\)/);
});
