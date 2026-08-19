const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("heavy routes delegate to feature domains", () => {
  for (const [route, feature] of [
    ["src/app/admin/(painel)/settings/page.tsx", "@/features/settings/SettingsWorkspace"],
    ["src/app/admin/(painel)/orders/page.tsx", "@/features/orders/OrdersPage"],
    ["src/app/[slug]/page.tsx", "@/features/storefront/StorefrontPage"],
  ]) {
    const source = read(route);
    assert.ok(source.length < 300, `${route} should stay a thin route`);
    assert.match(source, new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("checkout owns checkout and delivery implementation", () => {
  for (const file of [
    "CheckoutDrawer.tsx",
    "DeliveryCalculator.tsx",
    "checkout-format.ts",
    "use-checkout-analytics.ts",
    "use-payment-methods.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(root, "src/features/checkout", file)), `missing checkout/${file}`);
  }

  assert.match(read("src/features/storefront/CheckoutDrawer.tsx"), /@\/features\/checkout\/CheckoutDrawer/);
  assert.match(read("src/features/storefront/checkout-format.ts"), /@\/features\/checkout\/checkout-format/);
});

test("storefront catalog implementation lives in the catalog subdomain", () => {
  for (const file of ["ProductImage.tsx", "ProductPicker.tsx", "catalog-navigation.ts", "product-options.ts"]) {
    assert.ok(fs.existsSync(path.join(root, "src/features/storefront/catalog", file)), `missing catalog/${file}`);
  }

  assert.match(read("src/features/storefront/ProductPicker.tsx"), /\.\/catalog\/ProductPicker/);
  assert.match(read("src/features/storefront/catalog-navigation.ts"), /\.\/catalog\/catalog-navigation/);
});

test("settings and orders keep their domain implementation outside app routes", () => {
  assert.ok(fs.existsSync(path.join(root, "src/features/settings/SettingsWorkspace.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/features/orders/OrdersPage.tsx")));
  assert.ok(read("src/features/settings/SettingsWorkspace.tsx").length > 10_000);
  assert.ok(read("src/features/orders/OrdersPage.tsx").length > 10_000);
});
