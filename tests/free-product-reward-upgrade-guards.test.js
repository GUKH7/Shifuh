import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rewardMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260902184658_validate_existing_free_product_rewards_and_expiry.sql", import.meta.url),
  "utf8",
);
const prizeMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260902190812_deactivate_incompatible_free_product_prizes.sql", import.meta.url),
  "utf8",
);

test("upgrade cancels incompatible usable free-product rewards", () => {
  assert.match(rewardMigration, /update public\.customer_rewards cr/);
  assert.match(rewardMigration, /set status = 'cancelled'/);
  assert.match(rewardMigration, /cr\.reward_type = 'free_product'/);
  assert.match(rewardMigration, /cr\.status = 'available'/);
  assert.match(rewardMigration, /cr\.expires_at is null or cr\.expires_at > now\(\)/);
  assert.match(rewardMigration, /addon_group ->> 'required'/);
  assert.match(rewardMigration, /addon_group ->> 'min_options'/);
});

test("reward guard reruns when expiry is changed or extended", () => {
  assert.match(
    rewardMigration,
    /before insert or update of reward_type, product_id, status, expires_at, restaurant_id/i,
  );
  assert.match(rewardMigration, /execute function public\.guard_available_free_product_reward_configuration\(\)/);
});

test("upgrade deactivates incompatible legacy free-product prizes", () => {
  assert.match(prizeMigration, /from public\.promotion_prizes pp/);
  assert.match(prizeMigration, /pp\.active = true/);
  assert.match(prizeMigration, /pp\.prize_type = 'free_product'/);
  assert.match(prizeMigration, /addon_group ->> 'required'/);
  assert.match(prizeMigration, /addon_group ->> 'min_options'/);
  assert.match(prizeMigration, /update public\.promotion_prizes pp/);
  assert.match(prizeMigration, /set active = false/);
});

test("upgrade pauses active or scheduled campaigns before removing invalid outcomes", () => {
  assert.match(prizeMigration, /update public\.promotion_campaigns pc/);
  assert.match(prizeMigration, /set status = 'paused'/);
  assert.match(prizeMigration, /pc\.status in \('active', 'scheduled'\)/);
  assert.match(prizeMigration, /select distinct campaign_id from incompatible/);
});
