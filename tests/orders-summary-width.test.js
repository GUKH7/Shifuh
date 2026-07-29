const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const skeleton = fs.readFileSync(
  path.join(root, "src/app/admin/(painel)/orders/OrdersSkeleton.tsx"),
  "utf8",
);

test("resumo de pedidos usa as mesmas bordas dos containers principais", () => {
  assert.match(
    globals,
    /\.admin-panel-content > section\.fixed:has\(> button\[aria-expanded\]\)/,
  );
  assert.doesNotMatch(globals, /\.admin-page-shell section\.fixed/);
  assert.match(globals, /left: calc\(var\(--admin-sidebar-width\) \+ 1\.5rem\)/);
  assert.match(globals, /right: max\(0px, calc\(1\.5rem - \(100vw - 100%\)\)\)/);
  assert.match(globals, /width: auto/);
  assert.match(globals, /max-width: 1460px/);
});

test("skeleton de pedidos representa a estrutura atual e o resumo fixo", () => {
  assert.match(skeleton, /max-w-\[1460px\]/);
  assert.match(skeleton, /lg:grid-cols-\[1fr_auto\]/);
  assert.match(
    skeleton,
    /xl:grid-cols-\[96px_145px_100px_64px_78px_120px_104px_80px_145px\]/,
  );
  assert.match(skeleton, /section className="fixed bottom-3/);
  assert.match(skeleton, /aria-expanded=\{false\}/);
});
