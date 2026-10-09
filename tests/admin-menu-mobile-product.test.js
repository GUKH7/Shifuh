const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");
const productModal = fs.readFileSync("src/components/product-modal.tsx", "utf8");
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


test("cada categoria permite criar produto já com a categoria selecionada", () => {
  assert.match(menu, /menu-category-add-product/);
  assert.match(menu, /handleOpenNewProduct\(category\.id\)/);
  assert.match(menu, /aria-label=\{\`Adicionar produto em \$\{category\.name\}\`\}/);
  assert.match(menu, /initialCategoryId=\{newProductCategoryId\}/);
  assert.match(productModal, /initialCategoryId\?: string \| null/);
  assert.match(productModal, /categories\.some\(\(category\) => category\.id === initialCategoryId\)/);
  assert.match(productModal, /setCategoryId\(preferredCategoryId\)/);
});


test("botão de novo produto da categoria expande como as demais ações", () => {
  assert.match(menu, /menu-category-add-product/);
  assert.match(responsive, /\.menu-category-add-product > span/);
  assert.match(responsive, /\.menu-category-add-product:hover/);
  assert.match(responsive, /\.menu-category-add-product:is\(:hover, :focus-visible\) > span/);
});
