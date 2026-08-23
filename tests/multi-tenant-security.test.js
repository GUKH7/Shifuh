const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", ...segments), "utf8");
}

test("platform restaurant listing is fetched through the protected server API", () => {
  const page = read("src", "app", "admin", "(painel)", "platform", "page.tsx");
  const listingRoute = read("src", "app", "api", "platform", "restaurants", "route.ts");

  assert.match(page, /fetch\(`\/api\/platform\/restaurants\?status=\$\{status\}`/);
  assert.doesNotMatch(page, /\.from\("restaurants"\)/);
  assert.match(listingRoute, /requirePlatformPermission\("restaurants\.read"\)/);
  assert.doesNotMatch(listingRoute, /isPlatformAdminEmail/);
});

test("restaurant image uploads are namespaced by restaurant id", () => {
  const settings = read("src", "app", "admin", "(painel)", "settings", "page.tsx");
  const productModal = read("src", "components", "product-modal.tsx");
  const productDetailsModal = read("src", "components", "product-details-modal.tsx");

  assert.match(settings, /\$\{restaurantId\}\/\$\{Date\.now\(\)\}/);
  assert.match(productModal, /\$\{restaurantId\}\/\$\{Date\.now\(\)\}-prod\.jpg/);
  assert.match(productDetailsModal, /\$\{restaurantId\}\/\$\{Date\.now\(\)\}-prod\.jpg/);
});

test("storage writes require ownership of the folder restaurant", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260717140916_isolate_restaurant_storage.sql",
  );
  assert.match(migration, /to authenticated[\s\S]+storage\.foldername\(name\)/i);
  assert.match(migration, /restaurants\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /for insert[\s\S]+for update[\s\S]+for delete/i);
});
