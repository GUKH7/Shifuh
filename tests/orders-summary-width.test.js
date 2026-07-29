const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

test("resumo de pedidos usa as mesmas bordas dos containers principais", () => {
  assert.match(globals, /section\.fixed:has\(> button\[aria-expanded\]\)/);
  assert.match(globals, /left: calc\(var\(--admin-sidebar-width\) \+ 1\.5rem\)/);
  assert.match(globals, /right: max\(0px, calc\(1\.5rem - \(100vw - 100%\)\)\)/);
  assert.match(globals, /width: auto/);
  assert.match(globals, /max-width: 1460px/);
  assert.doesNotMatch(globals, /right: 1\.5rem;/);
  assert.doesNotMatch(globals, /width: min\(1460px, calc\(100vw/);
});
