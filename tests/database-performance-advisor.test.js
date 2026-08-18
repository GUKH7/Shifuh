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
    "20260818144916_optimize_rls_and_foreign_key_indexes.sql",
  ),
  "utf8",
);

test("foreign keys flagged by Performance Advisor have covering indexes", () => {
  for (const [indexName, column] of [
    ["customer_addresses_user_id_idx", "user_id"],
    ["ifood_order_events_local_order_id_idx", "local_order_id"],
    ["reviews_restaurant_id_idx", "restaurant_id"],
    ["reviews_user_id_idx", "user_id"],
  ]) {
    assert.match(
      migration,
      new RegExp(`create index if not exists ${indexName}[\\s\\S]+\\(${column}\\)`, "i"),
    );
  }
});

test("duplicate restaurant slug index is removed without dropping the unique constraint", () => {
  assert.match(migration, /drop index if exists public\.idx_restaurants_slug/i);
  assert.doesNotMatch(migration, /drop constraint[^;]*restaurants_slug_key/i);
});

test("categories no longer use an ALL member policy that overlaps public SELECT", () => {
  assert.match(
    migration,
    /drop policy if exists "Members can manage restaurant categories" on public\.categories/i,
  );
  assert.match(migration, /for insert[\s\S]+Members can update restaurant categories/i);
  assert.match(migration, /for update[\s\S]+Members can delete restaurant categories/i);
  assert.match(migration, /for delete/i);
});

test("products use one SELECT policy per role while preserving member access to inactive products", () => {
  assert.match(migration, /create policy "Anon can read active products"[\s\S]+to anon[\s\S]+is_active = true/i);
  assert.match(
    migration,
    /create policy "Authenticated can read accessible products"[\s\S]+to authenticated[\s\S]+is_active = true[\s\S]+or exists/i,
  );
});

test("review read policies are collapsed into one authenticated OR policy", () => {
  assert.match(
    migration,
    /create policy "Authenticated can read accessible reviews"[\s\S]+user_id = \(select auth\.uid\(\)\)[\s\S]+or exists/i,
  );
});

test("auth.uid calls introduced by this migration are InitPlan-friendly", () => {
  const withoutWrappedCalls = migration.replaceAll("(select auth.uid())", "");
  assert.doesNotMatch(withoutWrappedCalls, /auth\.uid\(\)/i);
});
