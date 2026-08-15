const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const hardeningMigration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260815145918_harden_public_database_surface.sql"),
  "utf8",
);
const bestSellerMigration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260815150337_preserve_storefront_best_seller_threshold.sql"),
  "utf8",
);

function returnSignature(functionName) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = hardeningMigration.match(
    new RegExp(`create or replace function ${escapedName}\\(\\)\\s*returns table \\(([\\s\\S]*?)\\)\\s*language sql`, "i"),
  );
  assert.ok(match, `missing return signature for ${functionName}`);
  return match[1];
}

test("public storefront views run as invoker and grant clients read-only access", () => {
  for (const view of ["public_restaurants", "public_storefront_products"]) {
    assert.match(
      hardeningMigration,
      new RegExp(`create view public\\.${view}[\\s\\S]+security_invoker\\s*=\\s*true`, "i"),
    );
    assert.match(
      hardeningMigration,
      new RegExp(`revoke all privileges on public\\.${view} from public, anon, authenticated, service_role`, "i"),
    );
    assert.match(
      hardeningMigration,
      new RegExp(`grant select on public\\.${view} to anon, authenticated, service_role`, "i"),
    );
  }
});

test("public restaurant contract omits private operational fields", () => {
  const signature = returnSignature("app_private.get_public_restaurants");
  for (const field of ["latitude", "longitude", "color_theme", "accepted_payment_methods"]) {
    assert.doesNotMatch(signature, new RegExp(`\\b${field}\\b`, "i"));
  }
  assert.match(signature, /description text/i);
  assert.match(signature, /pickup_enabled boolean/i);
});

test("public product contract exposes the derived badge but not sales volume", () => {
  const signature = returnSignature("app_private.get_public_storefront_products");
  assert.match(signature, /is_best_seller boolean/i);
  assert.doesNotMatch(signature, /sold_quantity/i);
  assert.match(bestSellerMigration, /sold_quantity\s*>=\s*3[\s\S]+sales_rank\s*=\s*1/i);
});

test("signup trigger is internal and cannot be called through the public RPC schema", () => {
  assert.match(hardeningMigration, /create or replace function app_private\.handle_new_user\(\)/i);
  assert.match(hardeningMigration, /security definer[\s\S]+set search_path = ''/i);
  assert.match(hardeningMigration, /revoke all on function app_private\.handle_new_user\(\) from public, anon, authenticated, service_role/i);
  assert.match(hardeningMigration, /execute function app_private\.handle_new_user\(\)/i);
  assert.match(hardeningMigration, /drop function if exists public\.handle_new_user\(\)/i);
});

test("remaining trigger helpers use an immutable empty search path", () => {
  assert.match(hardeningMigration, /create or replace function public\.update_restaurant_rating\(\)[\s\S]+set search_path = ''/i);
  assert.match(hardeningMigration, /alter function public\.set_updated_at\(\) set search_path = ''/i);
  assert.match(hardeningMigration, /alter function public\.touch_ifood_updated_at\(\) set search_path = ''/i);
});
