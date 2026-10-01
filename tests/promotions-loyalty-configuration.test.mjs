import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync(
  "src/app/admin/(painel)/promotions/loyalty/LoyaltyProgramWorkspace.tsx",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260906154500_loyalty_program_configuration.sql",
  "utf8",
);

test("Configurador persiste um programa por restaurante", () => {
  assert.match(workspace, /from\("loyalty_programs"\)/);
  assert.match(workspace, /upsert\(payload, \{ onConflict: "restaurant_id" \}\)/);
  assert.match(migration, /create table public\.loyalty_programs/);
  assert.match(migration, /unique \(restaurant_id\)/);
});

test("Programa suporta acúmulo por gasto e por pedido sem valores inconsistentes", () => {
  assert.match(migration, /earning_mode in \('spend','order'\)/);
  assert.match(migration, /earning_mode = 'spend'/);
  assert.match(migration, /earning_mode = 'order'/);
  assert.match(migration, /points_per_order is null/);
  assert.match(migration, /spend_amount is null/);
  assert.match(workspace, /A cada valor gasto/);
  assert.match(workspace, /Pontos por pedido concluído/);
});

test("Configuração cobre status, pedido mínimo e validade opcional", () => {
  assert.match(migration, /status in \('draft','active','paused'\)/);
  assert.match(migration, /minimum_order_amount >= 0/);
  assert.match(migration, /points_validity_days is null or points_validity_days > 0/);
  assert.match(workspace, /Rascunho/);
  assert.match(workspace, /Ativo/);
  assert.match(workspace, /Pausado/);
  assert.match(workspace, /Pedido mínimo para pontuar/);
  assert.match(workspace, /Sem expiração/);
});

test("Tabela de fidelidade aplica isolamento por membro da loja", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Members manage loyalty programs/);
  assert.match(migration, /from public\.restaurant_members rm/);
  assert.match(migration, /rm\.restaurant_id = loyalty_programs\.restaurant_id/);
  assert.match(migration, /rm\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /grant all on table public\.loyalty_programs to service_role/);
});

test("configuração descreve o acúmulo automático já ativo sem misturar fidelidade com giros", () => {
  assert.doesNotMatch(migration, /promotion_campaigns/);
  assert.doesNotMatch(migration, /promotion_spins/);
  assert.match(workspace, /pontos são creditados automaticamente ao concluir pedidos elegíveis/);
  assert.match(workspace, /Acúmulo automático/);
  assert.doesNotMatch(workspace, /crédito automático será conectado/);
  assert.doesNotMatch(workspace, /Próxima frente/);
});
