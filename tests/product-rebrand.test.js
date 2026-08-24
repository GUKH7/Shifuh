const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("positions Shifuh as the delivery management product it is today", () => {
  const landing = read("src/app/page.tsx");
  const login = read("src/app/admin/login/page.tsx");
  const layout = read("src/app/layout.tsx");

  assert.doesNotMatch(`${landing}\n${login}`, /Fluxo MVP|sem mensalidade|Pedidos no Zap/);
  assert.match(landing, /Gestão de delivery para restaurantes/);
  assert.match(landing, /Pedidos centralizados/);
  assert.match(landing, /iFood e WhatsApp/);
  assert.match(login, /Toda a operação do seu/);
  assert.match(layout, /Shifuh \| Gestão de delivery para restaurantes/);
});

test("keeps the landing brand from overlapping the CTA on very narrow screens", () => {
  const layout = read("src/app/layout.tsx");
  const responsiveCss = read("src/app/landing-responsive.css");

  assert.match(layout, /import "\.\/landing-responsive\.css"/);
  assert.match(responsiveCss, /@media \(max-width: 359px\)/);
  assert.match(responsiveCss, /aria-label="Shifuh - início"/);
  assert.match(responsiveCss, /overflow: hidden/);
  assert.match(responsiveCss, /text-overflow: ellipsis/);
});
