const fs = require("node:fs");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const root = path.resolve(__dirname, "..");
const originalReadFileSync = fs.readFileSync.bind(fs);

const sourceRedirects = new Map(
  Object.entries({
    "src/app/[slug]/page.tsx": "src/features/storefront/StorefrontPage.tsx",
    "src/features/storefront/ProductPicker.tsx": "src/features/storefront/catalog/ProductPicker.tsx",
    "src/features/storefront/CheckoutDrawer.tsx": "src/features/checkout/CheckoutDrawer.tsx",
    "src/features/storefront/DeliveryCalculator.tsx": "src/features/checkout/DeliveryCalculator.tsx",
    "src/app/admin/(painel)/orders/page.tsx": "src/features/orders/OrdersPage.tsx",
    "src/app/admin/(painel)/orders/utils.ts": "src/features/orders/utils.ts",
    "src/app/admin/(painel)/orders/OrdersDatePicker.tsx": "src/features/orders/OrdersDatePicker.tsx",
    "src/app/admin/(painel)/orders/orders-responsive.css": "src/features/orders/orders-responsive.css",
    "src/app/admin/(painel)/settings/page.tsx": "src/features/settings/SettingsWorkspace.tsx",
    "src/app/admin/(painel)/history/page.tsx": "src/app/admin/(painel)/history/HistoryWorkspace.tsx",
  }).map(([from, to]) => [path.resolve(root, from), path.resolve(root, to)]),
);

fs.readFileSync = function readFileSyncWithCurrentSource(file, ...args) {
  if (typeof file === "string" || file instanceof URL) {
    const absolutePath = file instanceof URL ? null : path.resolve(String(file));
    const redirectedPath = absolutePath ? sourceRedirects.get(absolutePath) : null;
    if (redirectedPath) return originalReadFileSync(redirectedPath, ...args);
  }

  return originalReadFileSync(file, ...args);
};

syncBuiltinESMExports();
