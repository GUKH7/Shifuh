const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefront = fs.readFileSync(path.join(root, "src", "app", "[slug]", "page.tsx"), "utf8");
const checkout = fs.readFileSync(path.join(root, "src", "features", "storefront", "CheckoutDrawer.tsx"), "utf8");
const tracking = fs.readFileSync(path.join(root, "src", "app", "acompanhar", "[id]", "tracking-client.tsx"), "utf8");

test("storefront presents status, estimate and starting delivery fee together", () => {
  assert.match(storefront, /deliveryFeeLabel/);
  assert.match(storefront, /Entrega a partir de/);
  assert.match(storefront, /min-h-10 max-w-\[75vw\].*rounded-full border/);
});

test("mobile cart separates order summary from its main action", () => {
  assert.match(storefront, /Sacola · \{cartQuantity\}/);
  assert.match(storefront, /Ver pedido <ArrowRight/);
  assert.match(storefront, /bg-\[#fffdfa\].*shadow/);
});

test("checkout keeps compact progress and totals visible in the footer", () => {
  assert.match(checkout, /Etapas do pedido/);
  assert.match(checkout, /h-2\.5 w-2\.5 shrink-0 rounded-full/);
  assert.match(checkout, /Entrega estimada/);
  assert.match(checkout, /Total do pedido/);
});

test("tracking delays the reassurance notice for five minutes", () => {
  assert.match(tracking, />= 5 \* 60_000/);
  assert.match(tracking, /Seu pedido está registrado com segurança/);
});
