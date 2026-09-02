const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const rewardMigration = fs.readFileSync(
  path.join(migrationsDir, "20260902175741_serialize_reward_order_idempotency.sql"),
  "utf8",
);
const ordinaryMigration = fs.readFileSync(
  path.join(migrationsDir, "20260902180717_serialize_all_storefront_order_idempotency.sql"),
  "utf8",
);

const sharedLockPattern = /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_restaurant_id::text \|\| ':' \|\| (?:v_idempotency_key|normalized_idempotency_key), 0\)\s*\)/s;

test("pedido com prêmio e pedido comum serializam a mesma chave idempotente", () => {
  assert.match(rewardMigration, sharedLockPattern);
  assert.match(ordinaryMigration, sharedLockPattern);
});

test("pedido comum não reaproveita chave vinculada a pedido premiado", () => {
  assert.match(ordinaryMigration, /from public\.customer_rewards cr/s);
  assert.match(ordinaryMigration, /cr\.redeemed_order_id = created_order\.order_id/s);
  assert.match(ordinaryMigration, /Idempotency key already used with a reward/);

  const occurrences = ordinaryMigration.match(/Idempotency key already used with a reward/g) || [];
  assert.equal(occurrences.length, 2, "a proteção deve existir no retorno normal e no fallback de unique_violation");
});

test("pedido premiado continua rejeitando a mesma chave com outro prêmio", () => {
  assert.match(rewardMigration, /cr\.redeemed_order_id = v_existing_order\.id/s);
  assert.match(rewardMigration, /v_reward\.id <> p_reward_id/s);
  assert.match(rewardMigration, /Idempotency key already used with a different reward/);
});

test("as duas RPCs permanecem restritas ao service_role", () => {
  for (const migration of [rewardMigration, ordinaryMigration]) {
    assert.match(migration, /revoke all on function public\./s);
    assert.match(migration, /from public, anon, authenticated/s);
    assert.match(migration, /grant execute on function public\./s);
    assert.match(migration, /to service_role/s);
  }
});
