import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260902183843_strengthen_free_product_reward_guards.sql", import.meta.url),
  "utf8",
);

test("all free-product write paths use the same product-scoped advisory lock", () => {
  const lockMatches = migration.match(/pg_advisory_xact_lock\([\s\S]*?promotion-free-product:/g) || [];
  assert.equal(lockMatches.length, 3);
  assert.match(migration, /guard_free_product_reward_configuration/);
  assert.match(migration, /guard_available_free_product_reward_configuration/);
  assert.match(migration, /guard_product_required_addons_for_active_rewards/);
});

test("issued available free-product rewards keep the product add-on guard active", () => {
  assert.match(migration, /customer_rewards_guard_free_product_required_addons/);
  assert.match(migration, /cr\.reward_type\s*=\s*'free_product'/);
  assert.match(migration, /cr\.status\s*=\s*'available'/);
  assert.match(migration, /cr\.expires_at\s+is\s+null\s+or\s+cr\.expires_at\s*>\s*now\(\)/i);
  assert.match(migration, /active or issued free-product reward/);
});

test("available reward issuance also rejects products with required add-ons", () => {
  assert.match(migration, /new\.status\s*=\s*'available'/);
  assert.match(migration, /new\.reward_type\s*=\s*'free_product'/);
  assert.match(migration, /Available free product reward cannot reference a product with required add-ons/);
});
