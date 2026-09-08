import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260908130000_loyalty_reward_catalog.sql",
  "utf8",
);
const page = fs.readFileSync(
  "src/app/admin/(painel)/promotions/loyalty/page.tsx",
  "utf8",
);
const catalog = fs.readFileSync(
  "src/app/admin/(painel)/promotions/loyalty/LoyaltyRewardCatalog.tsx",
  "utf8",
);

test("catálogo possui tabela própria sem reutilizar prêmios da roleta", () => {
  assert.match(migration, /create table public\.loyalty_rewards/);
  assert.match(migration, /references public\.loyalty_programs\(id, restaurant_id\)/);
  assert.doesNotMatch(migration, /promotion_prizes/);
  assert.doesNotMatch(migration, /customer_rewards/);
});

test("recompensas suportam os quatro benefícios compatíveis com checkout", () => {
  assert.match(migration, /reward_type in \('percent','fixed','free_shipping','free_product'\)/);
  assert.match(migration, /percentage_value > 0/);
  assert.match(migration, /percentage_value <= 100/);
  assert.match(migration, /fixed_amount > 0/);
  assert.match(migration, /reward_type = 'free_product'/);
  assert.match(migration, /product_id is not null/);
});

test("produto grátis não pode apontar para produto de outro tenant", () => {
  assert.match(migration, /products_id_restaurant_id_uidx/);
  assert.match(migration, /foreign key \(product_id, restaurant_id\)/);
  assert.match(migration, /references public\.products\(id, restaurant_id\)/);
});

test("catálogo valida custo, pedido mínimo, validade e limite total", () => {
  assert.match(migration, /points_cost > 0/);
  assert.match(migration, /minimum_order_amount >= 0/);
  assert.match(migration, /reward_validity_days is null or reward_validity_days between 1 and 3650/);
  assert.match(migration, /max_redemptions_total is null or max_redemptions_total > 0/);
});

test("catálogo é exposto apenas a membros autenticados da própria loja", () => {
  assert.match(migration, /alter table public\.loyalty_rewards enable row level security/);
  assert.match(migration, /revoke all on table public\.loyalty_rewards from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.loyalty_rewards to authenticated/);
  assert.match(migration, /rm\.restaurant_id = loyalty_rewards\.restaurant_id/);
  assert.match(migration, /rm\.user_id = \(select auth\.uid\(\)\)/);
});

test("página de Fidelidade conecta o CRUD administrativo do catálogo", () => {
  assert.match(page, /LoyaltyRewardCatalog/);
  assert.match(catalog, /Catálogo de recompensas/);
  assert.match(catalog, /\.from\("loyalty_rewards"\)/);
  assert.match(catalog, /\.insert\(payload\)/);
  assert.match(catalog, /\.update\(payload\)/);
  assert.match(catalog, /\.delete\(\)/);
});

test("interface deixa explícito que débito e emissão pertencem ao resgate futuro", () => {
  assert.match(catalog, /o débito dos pontos e a emissão da recompensa serão feitos pelo fluxo seguro de resgate/);
  assert.match(migration, /Points are not debited here/);
});
