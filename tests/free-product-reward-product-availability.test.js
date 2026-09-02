import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260902191700_guard_free_product_product_availability.sql", import.meta.url),
  "utf8",
);

test("product status changes run through the free-product guard", () => {
  assert.match(migration, /before update of addons, is_active/i);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*?promotion-free-product:/);
  assert.match(migration, /coalesce\(new\.is_active, false\) = false/);
  assert.match(migration, /Product cannot be deactivated while used by an active or issued free-product reward/);
});

test("product deactivation considers both active prizes and usable issued rewards", () => {
  assert.match(migration, /from public\.promotion_prizes pp/);
  assert.match(migration, /pp\.prize_type = 'free_product'/);
  assert.match(migration, /pp\.active = true/);
  assert.match(migration, /from public\.customer_rewards cr/);
  assert.match(migration, /cr\.reward_type = 'free_product'/);
  assert.match(migration, /cr\.status = 'available'/);
  assert.match(migration, /cr\.expires_at is null or cr\.expires_at > now\(\)/);
});

test("upgrade repairs legacy inactive-product prizes and rewards", () => {
  assert.match(migration, /update public\.customer_rewards cr/);
  assert.match(migration, /set status = 'cancelled'/);
  assert.match(migration, /p\.is_active = false/);
  assert.match(migration, /update public\.promotion_campaigns pc/);
  assert.match(migration, /set status = 'paused'/);
  assert.match(migration, /update public\.promotion_prizes pp/);
  assert.match(migration, /set active = false/);
});

test("availability guard remains invoker-only and hidden from exposed roles", () => {
  assert.match(migration, /security invoker/i);
  assert.match(
    migration,
    /revoke all on function public\.guard_product_required_addons_for_active_rewards\(\) from public, anon, authenticated/i,
  );
});
