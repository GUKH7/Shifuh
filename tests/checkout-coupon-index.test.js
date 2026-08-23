const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260823134500_index_order_coupon_usage_lookup.sql",
  ),
  "utf8",
);

test("contagem de uso de cupom tem índice por restaurante e código", () => {
  assert.match(
    migration,
    /create index if not exists idx_orders_restaurant_coupon_code\s+on public\.orders \(restaurant_id, coupon_code\)/i,
  );
  assert.match(migration, /where coupon_code is not null/i);
});
