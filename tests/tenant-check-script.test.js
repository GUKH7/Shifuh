const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "multi-tenant-check.mjs"),
  "utf8",
);

test("multi-tenant check has a production safety latch and guaranteed cleanup", () => {
  assert.match(script, /MULTITENANT_TEST_ALLOW_PRODUCTION/);
  assert.match(script, /finally \{/);
  assert.match(script, /deleteUser\(userId\)/);
  assert.match(script, /from\("restaurants"\)\.delete\(\)/);
});

test("multi-tenant check covers sensitive reads and cross-tenant writes", () => {
  for (const table of ["restaurants", "customers", "coupons", "orders", "ifood_integrations"]) {
    assert.match(script, new RegExp(`["']${table}["']`));
  }
  assert.match(script, /update\(\{ status: "done" \}\)/);
  assert.match(script, /Lojista A inseriu cupom na loja B/);
});

test("database migration verifies RLS under authenticated role", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20260717143348_verify_multi_tenant_isolation.sql",
    ),
    "utf8",
  );
  assert.match(migration, /set local role authenticated/i);
  assert.match(migration, /tenant A read tenant B orders/i);
  assert.match(migration, /tenant A updated tenant B order/i);
  assert.match(migration, /RLS verification complete; rolling back fixtures/i);
  assert.match(migration, /when sqlstate 'ZT001'/i);
});
