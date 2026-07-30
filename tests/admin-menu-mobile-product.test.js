const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("nomes de produtos quebram corretamente no cardápio mobile", () => {
  assert.match(menu, /menu-product-name/);
  assert.match(responsive, /\.menu-product-name[\s\S]*overflow-wrap: anywhere/);
  assert.match(responsive, /white-space: normal/);
});

test("ação de editar usa classe semântica e rótulo acessível", () => {
  assert.match(menu, /menu-product-edit/);
  assert.match(menu, /aria-label=.*Editar produto/);
  assert.match(menu, /<Edit3 size=\{15\}/);
  assert.match(responsive, /\.menu-product-edit[\s\S]*width: var\(--admin-control-height\)/);
  assert.match(responsive, /\.menu-product-edit-label[\s\S]*display: none/);
});
