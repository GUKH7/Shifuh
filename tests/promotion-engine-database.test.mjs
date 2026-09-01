import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const foundation = fs.readFileSync(
  "supabase/migrations/20260901142327_promotion_engine_foundation.sql",
  "utf8",
);
const indexes = fs.readFileSync(
  "supabase/migrations/20260901142500_promotion_engine_fk_indexes.sql",
  "utf8",
);

test("promotion engine migration creates the full persistence model", () => {
  for (const table of [
    "promotion_campaigns",
    "promotion_eligibility_rules",
    "promotion_prizes",
    "promotion_spins",
    "promotion_spin_results",
    "customer_rewards",
  ]) {
    assert.match(foundation, new RegExp(`create table public\\.${table}`));
  }
});

test("promotion tables use restaurant-scoped RLS", () => {
  assert.match(foundation, /alter table public\.promotion_campaigns enable row level security/);
  assert.match(foundation, /alter table public\.promotion_spin_results enable row level security/);
  assert.match(foundation, /alter table public\.customer_rewards enable row level security/);
  assert.match(foundation, /public\.restaurant_members rm/);
  assert.match(foundation, /rm\.restaurant_id = promotion_campaigns\.restaurant_id/);
  assert.match(foundation, /rm\.restaurant_id = promotion_spin_results\.restaurant_id/);
});

test("spin results are snapshotted, finalized atomically and immutable", () => {
  assert.match(foundation, /prepare_promotion_spin_result/);
  assert.match(foundation, /finalize_promotion_spin_result/);
  assert.match(foundation, /Promotion spin results are immutable/);
  assert.match(foundation, /before update or delete on public\.promotion_spin_results/);
  assert.match(foundation, /insert into public\.customer_rewards/);
  assert.match(foundation, /set status = 'resolved', resolved_at = new\.created_at/);
});

test("tenant composite foreign keys and idempotency protect operational rows", () => {
  assert.match(foundation, /foreign key \(customer_id, restaurant_id\)/);
  assert.match(foundation, /foreign key \(source_order_id, restaurant_id\)/);
  assert.match(foundation, /foreign key \(product_id, restaurant_id\)/);
  assert.match(foundation, /unique \(restaurant_id, idempotency_key\)/);
  assert.match(indexes, /promotion_spins_customer_tenant_fk_idx/);
  assert.match(indexes, /promotion_results_spin_tenant_fk_idx/);
  assert.match(indexes, /customer_rewards_result_tenant_fk_idx/);
});
