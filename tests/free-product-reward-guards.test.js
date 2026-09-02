import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260902183011_guard_free_product_reward_required_addons.sql", import.meta.url),
  "utf8",
);

test("free-product rewards reject products that require add-on selections", () => {
  assert.match(migration, /promotion_prizes_guard_free_product_required_addons/);
  assert.match(migration, /prize_type\s*=\s*'free_product'/);
  assert.match(migration, /addon_group\s*->>\s*'required'/);
  assert.match(migration, /addon_group\s*->>\s*'min_options'/);
  assert.match(migration, /Free product prize cannot reference a product with required add-ons/);
});

test("products used by active free-product rewards cannot later gain required add-ons", () => {
  assert.match(migration, /products_guard_required_addons_for_active_rewards/);
  assert.match(migration, /pp\.prize_type\s*=\s*'free_product'/);
  assert.match(migration, /pp\.active\s*=\s*true/);
  assert.match(migration, /Product cannot require add-ons while used by an active free-product reward/);
});

test("reward guard trigger functions remain invoker scoped and hidden from API roles", () => {
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /revoke all on function public\.guard_free_product_reward_configuration\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.guard_product_required_addons_for_active_rewards\(\) from public, anon, authenticated/);
});
