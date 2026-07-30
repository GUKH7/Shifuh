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

test("resumo de pedidos usa o mesmo shell e não depende da janela", () => {
  const page = fs.readFileSync(path.join(root, "src/app/admin/(painel)/orders/page.tsx"), "utf8");
  assert.match(page, /<AdminPageShell className="space-y-4 pb-6">/);
  assert.match(page, /section className="sticky bottom-3/);
  assert.doesNotMatch(page, /section className="fixed bottom-3/);
  assert.doesNotMatch(globals, /section\.fixed:has/);
});

test("skeleton de pedidos usa o padrão compartilhado e resumo sticky", () => {
  assert.match(skeleton, /AdminPageSkeleton/);
  assert.match(skeleton, /section className="sticky bottom-3/);
  assert.doesNotMatch(skeleton, /section className="fixed bottom-3/);
});
