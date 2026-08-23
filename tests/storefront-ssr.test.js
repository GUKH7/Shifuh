const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const layout = fs.readFileSync(path.join(root, "src/app/[slug]/layout.tsx"), "utf8");
const serverData = fs.readFileSync(
  path.join(root, "src/features/storefront/server-data.ts"),
  "utf8",
);
const hook = fs.readFileSync(
  path.join(root, "src/features/storefront/use-storefront.ts"),
  "utf8",
);

test("vitrine carrega restaurante e catalogo no servidor com ISR em uma RPC", () => {
  assert.match(layout, /export const revalidate = 60/);
  assert.match(layout, /await getPublicStorefront\(slug\)/);
  assert.match(layout, /StorefrontInitialDataProvider data=\{data\}/);
  assert.match(serverData, /unstable_cache/);
  assert.match(serverData, /rpc\("get_public_storefront_bundle"/);
  assert.doesNotMatch(serverData, /from\("public_restaurants"\)/);
  assert.doesNotMatch(serverData, /from\("public_storefront_products"\)/);
  assert.doesNotMatch(serverData, /from\("categories"\)/);
});

test("HTML inicial usa dados do servidor em vez de esperar fetch client-side", () => {
  assert.match(hook, /useStorefrontInitialData\(\)/);
  assert.match(hook, /useState<any>\(initialStorefront\?\.restaurant \?\? null\)/);
  assert.match(hook, /useState<Product\[]>\(initialStorefront\?\.products \?\? \[]\)/);
  assert.match(hook, /if \(!initialStorefront\) \{\s*fetchStoreData\(\);\s*\}/s);
});

test("metadata e Open Graph sao especificos por restaurante", () => {
  assert.match(layout, /export async function generateMetadata/);
  assert.match(layout, /const title = `\$\{restaurant\.name\} \| Shifuh`/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /data\.banners\[0\] \|\| restaurant\.image_url \|\| restaurant\.logo_url/);
  assert.match(layout, /canonical: canonicalUrl/);
});
