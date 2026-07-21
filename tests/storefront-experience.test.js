const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefront = fs.readFileSync(path.join(root, "src", "app", "[slug]", "page.tsx"), "utf8");
const checkout = fs.readFileSync(path.join(root, "src", "features", "storefront", "CheckoutDrawer.tsx"), "utf8");
const productPicker = fs.readFileSync(path.join(root, "src", "features", "storefront", "ProductPicker.tsx"), "utf8");
const tracking = fs.readFileSync(path.join(root, "src", "app", "acompanhar", "[id]", "tracking-client.tsx"), "utf8");

test("storefront presents status, estimate and starting delivery fee together", () => {
  assert.match(storefront, /deliveryFeeLabel/);
  assert.match(storefront, /Entrega a partir de/);
  assert.match(storefront, /min-h-10 max-w-\[75vw\].*rounded-full border/);
});

test("storefront keeps the page background neutral across restaurant brands", () => {
  assert.match(storefront, /const pageBackground = "#f5f6f7"/);
  assert.doesNotMatch(storefront, /const pageBackground = hexToRgba\(primaryColor/);
});

test("mobile cart separates order summary from its main action", () => {
  assert.match(storefront, /Sacola · \{cartQuantity\}/);
  assert.match(storefront, /Ver pedido <ArrowRight/);
  assert.match(storefront, /bg-\[#fffdfa\].*shadow/);
});

test("product modal preserves a stable image area on mobile", () => {
  assert.match(productPicker, /relative h-52 shrink-0 bg-\[#f3f4f6\] sm:h-72/);
  assert.match(productPicker, /className="object-contain p-3 sm:p-4"/);
});

test("checkout keeps compact progress and totals visible in the footer", () => {
  assert.match(checkout, /Etapas do pedido/);
  assert.match(checkout, /className="mt-3 flex w-full gap-1\.5 sm:gap-2"/);
  assert.match(checkout, /min-w-0 flex-1 rounded-xl border/);
  assert.doesNotMatch(checkout, /Etapas do pedido" className="[^"]*grid-cols-3/);
  assert.match(checkout, /Sacola", icon: ShoppingBag/);
  assert.match(checkout, /isComplete \? <Check/);
  assert.match(checkout, /isCurrent \? "Agora" : isComplete \? "Concluída" : "Próxima"/);
  assert.match(checkout, /Entrega estimada/);
  assert.match(checkout, /Total do pedido/);
});

test("tracking delays the reassurance notice for five minutes", () => {
  assert.match(tracking, />= 5 \* 60_000/);
  assert.match(tracking, /Seu pedido está registrado com segurança/);
});
