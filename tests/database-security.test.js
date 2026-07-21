const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20260717133957_harden_order_rpc_and_rls.sql"),
  "utf8",
);

test("order transaction RPC is restricted to service_role", () => {
  assert.match(migration, /revoke all on function public\.create_order_transaction[\s\S]+from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function public\.create_order_transaction[\s\S]+to service_role;/i);
});

test("public order inserts and display number allocation are revoked", () => {
  for (const table of ["customers", "orders", "order_items"]) {
    assert.match(migration, new RegExp(`revoke insert on public\\.${table} from anon, authenticated;`, "i"));
  }
  assert.match(migration, /revoke all on function public\.next_order_display_number\(uuid\) from public, anon, authenticated;/i);
});

test("coupon columns required by the transaction are aligned", () => {
  const couponAlignment = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260717134645_align_coupon_rpc_columns.sql"),
    "utf8",
  );
  assert.match(migration, /add column if not exists expires_at timestamptz/i);
  assert.match(couponAlignment, /add column if not exists usage_limit integer/i);
});

test("public storefront products expose only catalog metadata", () => {
  const storefrontProducts = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "017_storefront_product_metadata.sql"),
    "utf8",
  );
  assert.match(storefrontProducts, /revoke all on public\.public_storefront_products from public;/i);
  assert.match(storefrontProducts, /grant select on public\.public_storefront_products to anon, authenticated;/i);
  assert.doesNotMatch(storefrontProducts, /customer_(name|phone)|address_json/i);
});

test("storefront order RPC keeps operational rules server-only", () => {
  const operationalRules = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260720143723_operational_order_rules.sql"),
    "utf8",
  );
  assert.match(operationalRules, /minimum_order_amount numeric/i);
  assert.match(operationalRules, /scheduled_orders_enabled boolean/i);
  assert.match(operationalRules, /scheduled_for timestamptz/i);
  assert.match(operationalRules, /security_invoker\s*=\s*true/i);
  assert.match(operationalRules, /revoke all on function public\.create_storefront_order_transaction[\s\S]+from public, anon, authenticated;/i);
  assert.match(operationalRules, /grant execute on function public\.create_storefront_order_transaction[\s\S]+to service_role;/i);
});

test("storefront orders use a restaurant-scoped idempotency key", () => {
  const idempotencyMigration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260721162914_add_order_idempotency.sql"),
    "utf8",
  );
  assert.match(idempotencyMigration, /orders_restaurant_idempotency_key_unique/i);
  assert.match(idempotencyMigration, /on public\.orders \(restaurant_id, idempotency_key\)/i);
  assert.match(idempotencyMigration, /when unique_violation[\s\S]+idempotency_key = normalized_idempotency_key/i);
  assert.match(idempotencyMigration, /grant execute on function public\.create_storefront_order_transaction[\s\S]+to service_role;/i);
});

test("order status history remains server-only and records transitions", () => {
  const historyMigration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260721171535_order_status_history.sql"),
    "utf8",
  );
  assert.match(historyMigration, /alter table public\.order_status_history enable row level security/i);
  assert.match(historyMigration, /revoke all on table public\.order_status_history from public, anon, authenticated/i);
  assert.match(historyMigration, /grant select, insert, update, delete on table public\.order_status_history to service_role/i);
  assert.match(historyMigration, /after insert or update of status on public\.orders/i);
  assert.match(historyMigration, /set search_path = ''/i);
});
