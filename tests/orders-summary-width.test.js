const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/admin/(painel)/orders/page.tsx"), "utf8");
const skeleton = fs.readFileSync(
  path.join(root, "src/app/admin/(painel)/orders/OrdersSkeleton.tsx"),
  "utf8",
);

test("resumo de pedidos permanece compacto, fixo e alinhado ao shell de 1460px", () => {
  assert.match(page, /isSummaryOpen \? "pb-\[18rem\] sm:pb-\[11rem\]" : "pb-20"/);
  assert.match(page, /section className="fixed bottom-2 left-2 right-2 z-40/);
  assert.match(page, /md:left-\[calc\(var\(--admin-sidebar-width\)\+1\.5rem\)\]/);
  assert.match(page, /md:right-6 md:mx-auto md:max-w-\[1460px\]/);
  assert.match(page, /Ver resumo/);
  assert.doesNotMatch(page, /pb-\[26rem\]/);
  assert.doesNotMatch(page, /section className="sticky bottom-3/);
  assert.doesNotMatch(globals, /section\.fixed:has/);
});

test("skeleton representa o resumo fixo no rodapé", () => {
  assert.match(skeleton, /AdminPageSkeleton/);
  assert.match(skeleton, /section className="fixed bottom-2 left-2 right-2 z-40/);
  assert.match(skeleton, /md:max-w-\[1460px\]/);
  assert.doesNotMatch(skeleton, /section className="sticky bottom-3/);
});
