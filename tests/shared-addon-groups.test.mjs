import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260921193000_shared_addon_groups.sql",
  "utf8",
);
const modal = fs.readFileSync("src/components/product-modal.tsx", "utf8");

test("shared addon groups are normalized and linked to products", () => {
  assert.match(migration, /create table if not exists public\.addon_groups/i);
  assert.match(migration, /create table if not exists public\.product_addon_group_links/i);
  assert.match(migration, /primary key \(product_id, addon_group_id\)/i);
  assert.match(migration, /restaurant_id uuid not null references public\.restaurants/i);
  assert.match(migration, /alter table public\.addon_groups enable row level security/i);
  assert.match(migration, /app_private\.is_active_restaurant_member/i);
});

test("copying and linking use different persistence semantics", () => {
  assert.match(modal, /function cloneAddonGroup/);
  assert.match(modal, /id: crypto\.randomUUID\(\)/);
  assert.match(modal, /const linkLibraryGroup/);
  assert.match(modal, /current\.some\(\(item\) => item\.id === group\.id\)/);
  assert.match(modal, />\s*Copiar\s*</);
  assert.match(modal, /"Vincular"/);
});

test("linked group updates are saved canonically and cached back to products", () => {
  assert.match(migration, /save_product_addon_configuration/);
  assert.match(migration, /sync_product_addons_cache/);
  assert.match(migration, /after update on public\.addon_groups/i);
  assert.match(migration, /after insert or update or delete on public\.product_addon_group_links/i);
  assert.match(modal, /save_product_addon_configuration/);
  assert.match(modal, /p_groups: cleanGroups/);
});

test("groups and individual addon options can be paused globally", () => {
  assert.match(migration, /is_active boolean not null default true/i);
  assert.match(migration, /opt\.value->>'is_active'/);
  assert.match(modal, /toggleOptionActive/);
  assert.match(modal, /updateGroup\(groupIndex, "is_active"/);
  assert.match(modal, /Alterações, preços e pausas deste grupo serão aplicados a todos ao salvar/);
});

test("legacy product addon JSON remains an effective compatibility cache", () => {
  assert.match(migration, /set addons = v_addons/i);
  assert.match(modal, /buildEffectiveAddonCache\(cleanGroups\)/);
  assert.match(migration, /Migrate every existing inline product group to its own canonical group/i);
});
