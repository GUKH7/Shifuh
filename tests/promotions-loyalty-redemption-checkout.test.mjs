import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const redemptionMigration = fs.readFileSync(
  "supabase/migrations/20260908150500_loyalty_secure_redemption_checkout.sql",
  "utf8",
);
const unifiedCheckoutMigration = fs.readFileSync(
  "supabase/migrations/20260908151000_unify_issued_reward_checkout.sql",
  "utf8",
);
const reviewHardeningMigration = fs.readFileSync(
  "supabase/migrations/20260908153000_loyalty_redemption_review_hardening.sql",
  "utf8",
);
const redeemRoute = fs.readFileSync(
  "src/app/api/customer/loyalty/redeem/route.ts",
  "utf8",
);
const loyaltyRoute = fs.readFileSync(
  "src/app/api/customer/loyalty/route.ts",
  "utf8",
);
const customerRewardsRoute = fs.readFileSync(
  "src/app/api/customer/rewards/route.ts",
  "utf8",
);
const checkoutRewards = fs.readFileSync(
  "src/features/storefront/checkout-rewards.ts",
  "utf8",
);

test("resgate possui tabela própria e mantém isolamento por programa, cliente e tenant", () => {
  assert.match(redemptionMigration, /create table public\.loyalty_redemptions/);
  assert.match(redemptionMigration, /foreign key \(reward_id, restaurant_id, program_id\)/);
  assert.match(redemptionMigration, /foreign key \(account_id, restaurant_id, program_id, customer_id\)/);
  assert.match(redemptionMigration, /foreign key \(redeemed_order_id, restaurant_id\)/);
  assert.match(redemptionMigration, /unique \(restaurant_id, idempotency_key\)/);
  assert.match(redemptionMigration, /alter table public\.loyalty_redemptions enable row level security/);
  assert.match(redemptionMigration, /Members read loyalty redemptions/);
});

test("produto grátis da fidelidade herda as proteções de disponibilidade e complementos obrigatórios", () => {
  assert.match(redemptionMigration, /guard_loyalty_free_product_reward_configuration/);
  assert.match(redemptionMigration, /guard_available_loyalty_free_product_redemption/);
  assert.match(redemptionMigration, /loyalty_reward_product_requires_options/);
  assert.match(redemptionMigration, /loyalty_rewards lr/);
  assert.match(redemptionMigration, /loyalty_redemptions lrd/);
  assert.match(redemptionMigration, /Product cannot be deactivated while used by an active or issued free-product reward/);
});

test("customer_rewards vira carteira genérica sem falsificar ids da roleta", () => {
  assert.match(unifiedCheckoutMigration, /add column if not exists source_type text not null default 'roulette'/);
  assert.match(unifiedCheckoutMigration, /add column if not exists loyalty_redemption_id uuid/);
  assert.match(unifiedCheckoutMigration, /alter column spin_id drop not null/);
  assert.match(unifiedCheckoutMigration, /alter column spin_result_id drop not null/);
  assert.match(unifiedCheckoutMigration, /alter column prize_id drop not null/);
  assert.match(unifiedCheckoutMigration, /source_type = 'roulette'/);
  assert.match(unifiedCheckoutMigration, /source_type = 'loyalty'/);
  assert.match(unifiedCheckoutMigration, /loyalty_redemption_id is not null/);
});

test("resgate debita pontos uma única vez sob locks e respeita saldo e limite", () => {
  assert.match(unifiedCheckoutMigration, /create or replace function public\.redeem_loyalty_reward/);
  assert.match(unifiedCheckoutMigration, /for update/);
  assert.match(unifiedCheckoutMigration, /pg_advisory_xact_lock/);
  assert.match(unifiedCheckoutMigration, /points_balance < v_reward\.points_cost/);
  assert.match(unifiedCheckoutMigration, /Insufficient loyalty points/);
  assert.match(unifiedCheckoutMigration, /max_redemptions_total/);
  assert.match(unifiedCheckoutMigration, /Loyalty reward redemption limit reached/);
  assert.match(unifiedCheckoutMigration, /'redeem'/);
  assert.match(unifiedCheckoutMigration, /-v_reward\.points_cost::bigint/);
  assert.match(unifiedCheckoutMigration, /'loyalty:redeem:' \|\| v_redemption_id::text/);
});

test("resgate emite benefício genérico e sincroniza consumo do checkout com a auditoria de fidelidade", () => {
  assert.match(unifiedCheckoutMigration, /insert into public\.loyalty_redemptions/);
  assert.match(unifiedCheckoutMigration, /insert into public\.customer_rewards/);
  assert.match(unifiedCheckoutMigration, /'loyalty'/);
  assert.match(unifiedCheckoutMigration, /customer_rewards_sync_loyalty_redemption/);
  assert.match(unifiedCheckoutMigration, /redeemed_order_id = new\.redeemed_order_id/);
});

test("endpoint de resgate exige identidade verificada e idempotência", () => {
  assert.match(redeemRoute, /resolveCustomerPromotionContext/);
  assert.match(redeemRoute, /idempotency-key/);
  assert.match(redeemRoute, /redeem_loyalty_reward/);
  assert.match(redeemRoute, /LOYALTY_SESSION_REQUIRED/);
  assert.match(redeemRoute, /LOYALTY_INSUFFICIENT_POINTS/);
  assert.match(redeemRoute, /benefitId/);
});

test("backend do cliente expõe saldo, catálogo e origem do benefício para o checkout", () => {
  assert.match(loyaltyRoute, /loyalty_accounts/);
  assert.match(loyaltyRoute, /loyalty_rewards/);
  assert.match(loyaltyRoute, /canRedeem/);
  assert.match(customerRewardsRoute, /source_type/);
  assert.match(customerRewardsRoute, /loyalty_redemption_id/);
  assert.match(customerRewardsRoute, /source === "loyalty"/);
  assert.match(checkoutRewards, /source: "roulette" \| "loyalty"/);
});

test("descoberta de fidelidade normaliza telefones históricos antes de carregar a conta", () => {
  assert.match(reviewHardeningMigration, /find_loyalty_customers_by_phone/);
  assert.match(reviewHardeningMigration, /regexp_replace\(coalesce\(c\.phone, ''\), '\\D', '', 'g'\)/);
  assert.match(loyaltyRoute, /find_loyalty_customers_by_phone/);
  assert.doesNotMatch(loyaltyRoute, /\.eq\("phone", context\.phone\)/);
});

test("catálogo do cliente respeita o limite global antes de oferecer resgate", () => {
  assert.match(loyaltyRoute, /\.from\("loyalty_redemptions"\)/);
  assert.match(loyaltyRoute, /redemptionCountByReward/);
  assert.match(loyaltyRoute, /remainingRedemptions/);
  assert.match(loyaltyRoute, /balance >= pointsCost && hasCapacity/);
});

test("produto grátis preserva a origem da fidelidade no item do pedido", () => {
  assert.match(reviewHardeningMigration, /v_reward\.source_type = 'loyalty'/);
  assert.match(reviewHardeningMigration, /Recompensa do Programa de Fidelidade/);
  assert.match(reviewHardeningMigration, /Prêmio da Roleta da Sorte/);
  assert.match(reviewHardeningMigration, /'observation', v_reward_observation/);
});
