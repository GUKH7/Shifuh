import fs from "node:fs";

const replaceOnce = (file, before, after) => {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado em ${file}`);
  }
  fs.writeFileSync(file, source.replace(before, after));
};

replaceOnce(
  "src/app/admin/(painel)/orders/page.tsx",
  '<AdminPageShell className="space-y-4 pb-6">',
  '<AdminPageShell className={`space-y-4 ${isSummaryOpen ? "pb-[26rem]" : "pb-24"}`}>',
);

replaceOnce(
  "src/app/admin/(painel)/orders/page.tsx",
  '<section className="sticky bottom-3 z-20 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur">',
  '<section className="fixed bottom-3 left-3 right-3 z-40 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6 md:mx-auto md:max-w-[1460px]">',
);

replaceOnce(
  "src/app/admin/(painel)/orders/OrdersSkeleton.tsx",
  '<section className="sticky bottom-3 z-20 rounded-[18px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur">',
  '<section className="fixed bottom-3 left-3 right-3 z-40 rounded-[18px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6 md:mx-auto md:max-w-[1460px]">',
);

fs.writeFileSync(
  "tests/orders-summary-width.test.js",
  `const assert = require("node:assert/strict");
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

test("resumo de pedidos permanece fixo e alinhado ao shell de 1460px", () => {
  assert.match(page, /isSummaryOpen \? "pb-\[26rem\]" : "pb-24"/);
  assert.match(page, /section className="fixed bottom-3 left-3 right-3 z-40/);
  assert.match(page, /md:left-\[calc\(var\(--admin-sidebar-width\)\+1\.5rem\)\]/);
  assert.match(page, /md:right-6 md:mx-auto md:max-w-\[1460px\]/);
  assert.doesNotMatch(page, /section className="sticky bottom-3/);
  assert.doesNotMatch(globals, /section\.fixed:has/);
});

test("skeleton representa o resumo fixo no rodapé", () => {
  assert.match(skeleton, /AdminPageSkeleton/);
  assert.match(skeleton, /section className="fixed bottom-3 left-3 right-3 z-40/);
  assert.match(skeleton, /md:max-w-\[1460px\]/);
  assert.doesNotMatch(skeleton, /section className="sticky bottom-3/);
});
`,
);
