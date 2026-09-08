import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const loyaltyPage = fs.readFileSync("src/app/minha-conta/fidelidade/page.tsx", "utf8");
const accountPage = fs.readFileSync("src/app/minha-conta/page.tsx", "utf8");
const rewardsPage = fs.readFileSync("src/app/minha-conta/premios/page.tsx", "utf8");
const loyaltyRoute = fs.readFileSync("src/app/api/customer/loyalty/route.ts", "utf8");
const redeemRoute = fs.readFileSync("src/app/api/customer/loyalty/redeem/route.ts", "utf8");
const rewardsRoute = fs.readFileSync("src/app/api/customer/rewards/route.ts", "utf8");

test("Minha Conta deixa de simular pontos e aponta para o saldo real da fidelidade", () => {
  assert.doesNotMatch(accountPage, /orders\.length \* 10/);
  assert.match(accountPage, /fetch\('\/api\/customer\/loyalty'/);
  assert.match(accountPage, /singleLoyaltyProgram\.account\.balance/);
  assert.match(accountPage, /\/minha-conta\/fidelidade/);
  assert.match(accountPage, /\/minha-conta\/premios/);
});

test("Minha Conta não soma pontos que pertencem a lojas diferentes", () => {
  assert.doesNotMatch(accountPage, /reduce\(\(sum, program\).*account\?\.balance/s);
  assert.doesNotMatch(accountPage, /totalLoyaltyPoints/);
  assert.match(accountPage, /loyaltyPrograms\.length > 1/);
  assert.match(accountPage, /Cada loja mantém seu próprio saldo/);
});

test("experiência do cliente possui saldo, progresso, catálogo, resgate e histórico", () => {
  assert.match(loyaltyPage, /selectedProgram\.account\.balance/);
  assert.match(loyaltyPage, /Próxima conquista/);
  assert.match(loyaltyPage, /Troque seus pontos/);
  assert.match(loyaltyPage, /Resgatar recompensa/);
  assert.match(loyaltyPage, /Histórico de pontos/);
  assert.match(loyaltyPage, /Recompensas resgatadas/);
  assert.match(loyaltyPage, /\/api\/customer\/loyalty\/redeem/);
});

test("tentativa de resgate mantém idempotência enquanto o cliente repete a mesma ação", () => {
  assert.match(loyaltyPage, /setRedeemKey\(crypto\.randomUUID\(\)\)/);
  assert.match(loyaltyPage, /"idempotency-key": redeemKey/);
  assert.match(loyaltyPage, /if \(!selectedReward \|\| !redeemKey \|\| redeeming\) return/);
  assert.match(loyaltyPage, /setRedeemError/);
  assert.match(loyaltyPage, /setRedeemKey\(null\)/);
});

test("API de fidelidade entrega extrato e histórico apenas das contas verificadas", () => {
  assert.match(loyaltyRoute, /find_loyalty_customers_by_phone/);
  assert.match(loyaltyRoute, /loyalty_point_transactions/);
  assert.match(loyaltyRoute, /\.in\("account_id", accountIds\)/);
  assert.match(loyaltyRoute, /loyalty_redemptions/);
  assert.match(loyaltyRoute, /transactions:/);
  assert.match(loyaltyRoute, /redemptions:/);
  assert.match(loyaltyRoute, /HISTORY_LIMIT_PER_ACCOUNT = 20/);
});

test("catálogo do cliente inclui nome de produto grátis e capacidade restante", () => {
  assert.match(loyaltyRoute, /\.from\("products"\)/);
  assert.match(loyaltyRoute, /productName: product\?\.name \|\| null/);
  assert.match(loyaltyRoute, /remainingRedemptions/);
  assert.match(loyaltyRoute, /canRedeem: Boolean\(account && balance >= pointsCost && hasCapacity\)/);
});

test("resgate e carteira de prêmios usam a mesma normalização de telefone", () => {
  assert.match(redeemRoute, /find_loyalty_customers_by_phone/);
  assert.doesNotMatch(redeemRoute, /\.eq\("phone", context\.phone\)/);
  assert.match(rewardsRoute, /find_loyalty_customers_by_phone/);
  assert.doesNotMatch(rewardsRoute, /\.eq\("phone", context\.phone\)/);
});

test("Meus prêmios diferencia benefícios da Fidelidade e da Roleta", () => {
  assert.match(rewardsPage, /source: "roulette" \| "loyalty"/);
  assert.match(rewardsPage, /fromLoyalty/);
  assert.match(rewardsPage, /Fidelidade/);
  assert.match(rewardsPage, /Roleta/);
  assert.match(rewardsPage, /Resgatado por \{reward\.pointsSpent\} pontos/);
});

test("experiência suporta múltiplos programas sem misturar os saldos", () => {
  assert.match(loyaltyPage, /programs\.length > 1/);
  assert.match(loyaltyPage, /setSelectedProgramId\(program\.id\)/);
  assert.match(loyaltyPage, /programs\.find\(\(program\) => program\.id === selectedProgramId\)/);
});
