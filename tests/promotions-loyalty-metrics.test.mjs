import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260909070000_loyalty_management_metrics.sql",
  "utf8",
);
const dashboard = fs.readFileSync(
  "src/app/admin/(painel)/promotions/loyalty/LoyaltyManagementDashboard.tsx",
  "utf8",
);
const loyaltyPage = fs.readFileSync(
  "src/app/admin/(painel)/promotions/loyalty/page.tsx",
  "utf8",
);
const promotionsOverview = fs.readFileSync(
  "src/app/admin/(painel)/promotions/PromotionsOverview.tsx",
  "utf8",
);

test("RPC de gestão da fidelidade permanece tenant-scoped e autenticada", () => {
  assert.match(migration, /create or replace function public\.get_loyalty_management_metrics/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /from public\.restaurant_members rm/);
  assert.match(migration, /rm\.restaurant_id = p_restaurant_id/);
  assert.match(migration, /rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.get_loyalty_management_metrics\(uuid, integer\)[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.get_loyalty_management_metrics\(uuid, integer\)[\s\S]*to authenticated, service_role/);
});

test("dashboard aceita somente janelas gerenciais previstas", () => {
  assert.match(migration, /p_period_days not in \(0, 30, 90, 180, 365\)/);
  assert.match(dashboard, /value: 30, label: "30 dias"/);
  assert.match(dashboard, /value: 90, label: "90 dias"/);
  assert.match(dashboard, /value: 180, label: "180 dias"/);
  assert.match(dashboard, /value: 365, label: "1 ano"/);
  assert.match(dashboard, /value: 0, label: "Todo o período"/);
});

test("métricas cobrem clientes, pontos, resgates, benefícios e receita contextual", () => {
  for (const key of [
    "participants",
    "newParticipants",
    "customersWithBalance",
    "pointsInCirculation",
    "pointsIssuedPeriod",
    "pointsRedeemedPeriod",
    "pointsExpiredPeriod",
    "redemptionRatePct",
    "rewardsIssuedPeriod",
    "rewardsUsedPeriod",
    "rewardsAvailable",
    "earningOrdersPeriod",
    "earningOrdersRevenue",
    "redemptionOrdersPeriod",
    "redemptionOrdersRevenue",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("receita da fidelidade considera somente pedidos concluídos reais e não duplica pedidos", () => {
  assert.match(migration, /select distinct o\.id, o\.total[\s\S]*lpt\.transaction_type = 'earn'/);
  assert.match(migration, /select distinct o\.id, o\.total[\s\S]*lr\.status = 'redeemed'/);
  assert.match(migration, /o\.status = 'done'/);
  assert.match(migration, /coalesce\(o\.is_test, false\) = false/);
  assert.match(dashboard, /Pedidos que pontuaram/);
  assert.match(dashboard, /Pedidos com benefício usado/);
  assert.match(dashboard, /não são atribuição causal de receita incremental gerada pelo programa/);
  assert.doesNotMatch(dashboard, /Receita gerada pela fidelidade/);
});

test("agregação possui índices para os recortes do dashboard", () => {
  assert.match(migration, /loyalty_transactions_program_type_created_idx/);
  assert.match(migration, /restaurant_id, program_id, transaction_type, created_at desc/);
  assert.match(migration, /loyalty_redemptions_program_created_idx/);
  assert.match(migration, /loyalty_redemptions_program_status_redeemed_idx/);
});

test("dashboard consulta uma única RPC por loja e período", () => {
  assert.match(dashboard, /\.rpc\([\s\S]*"get_loyalty_management_metrics"/);
  assert.match(dashboard, /p_restaurant_id: currentRestaurantId/);
  assert.match(dashboard, /p_period_days: periodDays/);
  assert.match(dashboard, /getCurrentRestaurant\(supabase\)/);
});

test("painel exibe os seis indicadores principais e evolução limitada", () => {
  for (const label of [
    "Clientes participantes",
    "Pontos em circulação",
    "Pontos emitidos",
    "Pontos resgatados",
    "Taxa de resgate",
    "Benefícios utilizados",
  ]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /data\?\.trend \|\| \[\]\)\.slice\(-12\)/);
  assert.match(dashboard, /Emissão × resgate/);
});

test("gestão inclui performance de recompensas e clientes mais engajados", () => {
  assert.match(migration, /'periodRedemptions'/);
  assert.match(migration, /'periodUsed'/);
  assert.match(migration, /'pointsSpent'/);
  assert.match(migration, /limit 5/);
  assert.match(dashboard, /Performance das recompensas/);
  assert.match(dashboard, /O que os clientes mais resgatam/);
  assert.match(dashboard, /Clientes engajados/);
  assert.match(dashboard, /topRewards/);
  assert.match(dashboard, /data\.topCustomers/);
});

test("dashboard gerencial aparece antes da configuração operacional", () => {
  const dashboardIndex = loyaltyPage.indexOf("<LoyaltyManagementDashboard");
  const workspaceIndex = loyaltyPage.indexOf("<LoyaltyProgramWorkspace");
  const catalogIndex = loyaltyPage.indexOf("<LoyaltyRewardCatalog");
  const walletIndex = loyaltyPage.indexOf("<LoyaltyWalletLedger");
  assert.ok(dashboardIndex >= 0);
  assert.ok(dashboardIndex < workspaceIndex);
  assert.ok(workspaceIndex < catalogIndex);
  assert.ok(catalogIndex < walletIndex);
});

test("visão geral de Promoções não trata mais Fidelidade como mecânica futura", () => {
  const futureBlock = promotionsOverview.match(/const FUTURE_MECHANICS = \[([\s\S]*?)\];/)?.[1] || "";
  assert.doesNotMatch(futureBlock, /Fidelidade/);
  assert.match(promotionsOverview, /href="\/admin\/promotions\/loyalty"/);
  assert.match(promotionsOverview, /<h2 className="mt-5 text-xl font-black text-gray-950">Fidelidade<\/h2>/);
  assert.match(promotionsOverview, /Dashboard gerencial/);
});
