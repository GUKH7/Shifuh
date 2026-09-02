import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260902184658_validate_existing_free_product_rewards_and_expiry.sql", import.meta.url),
  "utf8",
);

test("upgrade cancels incompatible usable free-product rewards", () => {
  assert.match(migration, /update public\.customer_rewards cr/);
  assert.match(migration, /set status = 'cancelled'/);
  assert.match(migration, /cr\.reward_type = 'free_product'/);
  assert.match(migration, /cr\.status = 'available'/);
  assert.match(migration, /cr\.expires_at is null or cr\.expires_at > now\(\)/);
  assert.match(migration, /addon_group ->> 'required'/);
  assert.match(migration, /addon_group ->> 'min_options'/);
});

test("reward guard reruns when expiry is changed or extended", () => {
  assert.match(
    migration,
    /before insert or update of reward_type, product_id, status, expires_at, restaurant_id/i,
  );
  assert.match(migration, /execute function public\.guard_available_free_product_reward_configuration\(\)/);
});
