const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const clients = fs.readFileSync("src/app/admin/(painel)/clients/ClientsWorkspace.tsx", "utf8");
const coupons = fs.readFileSync("src/app/admin/(painel)/coupons/CouponsWorkspace.tsx", "utf8");
const couponsLayout = fs.readFileSync("src/app/admin/(painel)/coupons/layout.tsx", "utf8");
const reviews = fs.readFileSync("src/app/admin/(painel)/reviews/ReviewsWorkspace.tsx", "utf8");

test("AdminInput preserva espaço para ícones à esquerda", () => {
  assert.match(primitives, /className\?\.split\(\/\\s\+\/\)\.includes\("pl-11"\)/);
  assert.match(primitives, /paddingLeft: "2\.75rem"/);
});

test("todas as buscas com ícone usam o espaçamento global", () => {
  for (const workspace of [clients, coupons, reviews]) {
    assert.match(workspace, /<Search[\s\S]*<AdminInput[\s\S]*className="pl-11"/);
  }
});

test("cupons não depende mais de correção específica por placeholder", () => {
  assert.doesNotMatch(couponsLayout, /coupons-search\.css/);
});
