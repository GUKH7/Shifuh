"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const storefront = read("src/features/storefront/StorefrontPage.tsx");
const checkout = read("src/features/checkout/CheckoutDrawer.tsx");

test("mobile search has accessible name, reset target, results announcement and linked catalog", () => {
  assert.match(storefront, /type="search"[\s\S]*?aria-label="Buscar produtos no cardápio"/);
  assert.match(storefront, /aria-controls="storefront-catalog"/);
  assert.match(storefront, /aria-label="Limpar busca no cardápio"/);
  assert.match(storefront, /role="status" aria-live="polite"/);
  assert.match(storefront, /<main id="storefront-catalog"/);
});

test("category scrolling and persistent cart have comfortable mobile targets and safe-area inset", () => {
  assert.match(storefront, /<nav aria-label="Categorias do cardápio" ref=\{categoryNavRef\}/);
  assert.match(storefront, /min-h-11 py-2/);
  assert.match(storefront, /bottom-0 left-0 right-0 z-40 px-3 pb-\[max\(12px,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(storefront, /aria-label=\{\x60Abrir sacola com/);
  assert.match(storefront, /lg:pb-5/);
});

test("mobile cart can return to shopping and explains missing minimum", () => {
  assert.match(storefront, /onContinueShopping=\{\(\) => setIsCartOpen\(false\)\}/);
  assert.match(checkout, /onContinueShopping: \(\) => void/);
  assert.match(checkout, /onClick=\{onContinueShopping\}/);
  assert.match(checkout, /Adicionar mais itens/);
  assert.match(checkout, /Pedido mínimo: faltam \{formatMoney\(missingMinimum\)\}/);
  assert.match(checkout, /Confirmar pedido e enviar à loja/);
});

test("checkout server and purchase rules remain untouched by mobile UI changes", () => {
  assert.match(checkout, /disabled=\{isSubmitting \|\| paymentMethodsLoading \|\| !minimumReached \|\| storeClosedWithoutScheduling\}/);
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.git.deploymentEnabled.main, false);
  assert.equal(config.git.deploymentEnabled["feat/mobile-purchase-ux-20261111"], false);
});
