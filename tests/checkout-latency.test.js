const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const route = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "api", "orders", "route.ts"),
  "utf8",
);

test("checkout dispara autenticação e validações independentes na mesma janela", () => {
  assert.match(route, /const userPromise = supabase\.auth\.getUser\(\)/);
  assert.match(route, /const rewardContextPromise =/);
  assert.match(route, /const restaurantPromise =/);
  assert.match(route, /const productsPromise =/);
  assert.match(route, /const couponPromise =/);
  assert.match(route, /const couponUsagePromise =/);
  assert.match(route, /const rewardPromise =/);
  assert.match(
    route,
    /await Promise\.all\(\[\s*userPromise,\s*rewardContextPromise,\s*restaurantPromise,\s*productsPromise,\s*couponPromise,\s*couponUsagePromise,\s*rewardPromise,\s*\]\)/s,
  );
});

test("checkout não volta a serializar produtos cupom e contagem de uso", () => {
  const preTransaction = route.slice(0, route.indexOf('"create_storefront_order_transaction"'));

  assert.doesNotMatch(preTransaction, /await\s+adminSupabase\s*\.from\(["']products["']\)/);
  assert.doesNotMatch(preTransaction, /await\s+\(adminSupabase as any\)\s*\.from\(["']coupons["']\)/);
  assert.doesNotMatch(preTransaction, /await\s+adminSupabase\s*\.from\(["']orders["']\)/);
  assert.match(preTransaction, /couponUsageCount/);
});

test("sincronização opcional de perfil e endereço também evita waterfall", () => {
  assert.match(route, /const profileSyncs:/);
  assert.match(route, /await Promise\.all\(profileSyncs\)/);
});
