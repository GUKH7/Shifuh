const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("uses Shifuh as the canonical public brand and domain", () => {
  const brand = read("src/lib/brand.ts");
  const layout = read("src/app/layout.tsx");
  const storefrontLayout = read("src/app/[slug]/layout.tsx");
  const env = read(".env.example");

  assert.match(brand, /name:\s*"Shifuh"/);
  assert.match(brand, /siteUrl:\s*"https:\/\/www\.shifuh\.com\.br"/);
  assert.match(layout, /metadataBase:\s*new URL\(SHIFUH_BRAND\.siteUrl\)/);
  assert.match(layout, /canonical:\s*"\/"/);
  assert.match(storefrontLayout, /SHIFUH_BRAND\.siteUrl/);
  assert.match(env, /APP_BASE_URL=https:\/\/www\.shifuh\.com\.br/);
});

test("keeps the Next favicon synchronized with the official Shifuh mark", () => {
  assert.equal(read("src/app/icon.svg"), read("public/brand/shifuh-icon.svg"));
});

test("migrates legacy cart storage only after writing the Shifuh key", () => {
  const cart = read("src/features/storefront/use-cart.ts");

  assert.match(cart, /LEGACY_CART_STORAGE_PREFIX = "gestor-delivery:"/);
  assert.match(cart, /SHIFUH_CART_STORAGE_PREFIX = "shifuh:"/);
  assert.match(cart, /localStorage\.setItem\(currentStorageKey, savedCart\)/);
  assert.match(cart, /localStorage\.removeItem\(legacyStorageKey\)/);
  assert.ok(
    cart.indexOf("localStorage.setItem(currentStorageKey, savedCart)") <
      cart.indexOf("localStorage.removeItem(legacyStorageKey)"),
    "legacy cart must only be removed after the Shifuh copy is written",
  );
  assert.match(cart, /CART_SUBTOTAL_COOKIE = "shifuh_cart_subtotal"/);
  assert.match(cart, /LEGACY_CART_SUBTOTAL_COOKIE = "gestor_cart_subtotal"/);
});

test("removes the old product name and old Vercel URL from active routing identity", () => {
  const routing = read("src/lib/routing.ts");

  assert.doesNotMatch(routing, /GestorDelivery/);
  assert.doesNotMatch(routing, /gestor-delivery-tau\.vercel\.app/);
  assert.match(routing, /Shifuh\/1\.0/);
  assert.match(routing, /SHIFUH_BRAND\.siteUrl/);
});

test("provides a canonical Shifuh cron while retaining a documented compatibility alias", () => {
  const canonical = read("ops/oracle/shifuh.cron");
  const legacy = read("ops/oracle/gestor-delivery.cron");
  const docs = read("docs/operations/technical-rebrand.md");

  assert.match(canonical, /whatsapp-watchdog\.sh/);
  assert.match(legacy, /DEPRECATED/);
  assert.match(docs, /alias de compatibilidade/);
});
