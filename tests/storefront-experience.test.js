const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefront = fs.readFileSync(path.join(root, "src", "app", "[slug]", "page.tsx"), "utf8");
const checkout = fs.readFileSync(path.join(root, "src", "features", "storefront", "CheckoutDrawer.tsx"), "utf8");
const deliveryCalculator = fs.readFileSync(path.join(root, "src", "features", "storefront", "DeliveryCalculator.tsx"), "utf8");
const storefrontConstants = fs.readFileSync(path.join(root, "src", "features", "storefront", "constants.ts"), "utf8");

test("storefront keeps checkout as a focused full-screen flow", () => {
  assert.match(checkout, /fixed inset-0 z-50/);
  assert.match(checkout, /role="dialog"/);
  assert.match(checkout, /aria-modal="true"/);
  assert.match(checkout, /h-\[100dvh\]/);
  assert.match(checkout, /overflow-hidden/);
});

test("checkout reports the current step accessibly", () => {
  assert.match(checkout, /aria-label="Etapas do pedido"/);
  assert.match(checkout, /aria-live="polite"/);
  assert.match(checkout, /Etapa atual:/);
  assert.match(checkout, /aria-current=\{isCurrent \? "step" : undefined\}/);
});

test("checkout keeps actions accessible on mobile safe areas", () => {
  assert.match(checkout, /safe-area-top/);
  assert.match(checkout, /env\(safe-area-inset-bottom\)/);
  assert.match(checkout, /overscroll-none/);
});

test("cart and delivery keep quantities and address actions unambiguous", () => {
  assert.match(checkout, /cart\.reduce\(\(total, item\) => total \+ item\.quantity, 0\)/);
  assert.match(checkout, />Complementos</);
  assert.match(deliveryCalculator, /Buscar CEP/);
  assert.match(deliveryCalculator, /Sem número/);
  assert.match(checkout, /use “Calcular taxa e prazo” acima/);
  assert.doesNotMatch(checkout, />Calcule a entrega para continuar</);
  assert.match(deliveryCalculator, /savedAddr\.complement \|\| `Endereço \$\{index \+ 1\}`/);
});

test("delivery can find a postal code from the full address", () => {
  assert.match(deliveryCalculator, /Não sei meu CEP/);
  assert.match(deliveryCalculator, /\/api\/storefront\/postal-code/);
  assert.match(deliveryCalculator, /Encontrar meu CEP/);
  assert.match(deliveryCalculator, /Selecione o endereço correto:/);
});

test("delivery estimate fits narrow mobile cards without clipping", () => {
  assert.match(deliveryCalculator, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(deliveryCalculator, /whitespace-nowrap text-base font-black/);
  assert.match(deliveryCalculator, /Previsão de \{deliveryInfo\.time\} min/);
  assert.doesNotMatch(deliveryCalculator, /linha reta/i);
});

test("delivery address starts without a hardcoded city and resets CEP-derived fields", () => {
  assert.match(storefrontConstants, /city: "",\s+state: ""/);
  assert.doesNotMatch(storefrontConstants, /city: "S(?:Ã£|ã)o Paulo"/);
  assert.match(deliveryCalculator, /const handleCepChange = \(value: string\)/);
  assert.match(deliveryCalculator, /street: "",\s+neighborhood: "",\s+city: "",\s+state: ""/);
});

test("checkout keeps compact progress and totals visible in the footer", () => {
  assert.match(checkout, /Etapas do pedido/);
  assert.match(checkout, /className="mt-3 flex w-full gap-1\.5 sm:gap-2"/);
  assert.match(checkout, /min-w-0 flex-1 rounded-xl border/);
  assert.doesNotMatch(checkout, /Etapas do pedido" className="[^"]*grid-cols-3/);
  assert.match(checkout, /Sacola", icon: ShoppingBag/);
  assert.match(checkout, /isComplete \? <Check/);
  assert.match(checkout, /isCurrent \? "Agora" : isComplete \? "Concluída" : "Próxima"/);
  assert.match(checkout, /Valor dos produtos/);
  assert.match(checkout, /isPickup \? "Retirada" : "Frete"/);
  assert.match(checkout, /Total do pedido/);
  assert.match(checkout, /Prazo: \$\{deliveryInfo\?\.time\} min/);
  assert.match(checkout, /\{formatMoney\(cartSubtotal\)\}/);
  assert.match(checkout, /isPickup \? "Grátis" : formatMoney\(feeValue\)/);
  assert.match(checkout, /\{formatMoney\(finalTotal\)\}/);
  assert.match(checkout, /Total do pedido/);
});

test("checkout confirms and persists an order before leaving the storefront", () => {
  assert.match(storefront, /"Idempotency-Key": idempotencyKey/);
  assert.match(storefront, /gestor-delivery:last-order:/);
  assert.match(storefront, /setStep\("success"\)/);
  assert.doesNotMatch(storefront, /clearCart\(\);\s+setAppliedCoupon[\s\S]{0,180}router\.replace\(completedOrder\.trackingPath\)/);
  assert.match(checkout, /Pedido #\{completedOrder\.displayNumber/);
  assert.match(checkout, /Acompanhar pedido <ArrowRight/);
});

test("checkout confirms pickup without presenting a delivery forecast", () => {
  assert.match(checkout, /completedOrder\?\.fulfillmentType === "pickup"/);
  assert.match(checkout, /completedIsPickup \? "Retirada na loja" : "Entrega"/);
  assert.match(checkout, /Retire o pedido neste endereço\. Não há taxa de entrega\./);
});

test("checkout recovers from products removed after the cart was saved", () => {
  assert.match(storefront, /result\?\.code === "ITEM_UNAVAILABLE"/);
  assert.match(storefront, /setCart\(\(current\) => current\.filter/);
});
