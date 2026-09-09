import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const securityMigration = fs.readFileSync(
  "supabase/migrations/20260909103000_loyalty_security_antifraud.sql",
  "utf8",
);
const redeemRoute = fs.readFileSync(
  "src/app/api/customer/loyalty/redeem/route.ts",
  "utf8",
);
const customerContext = fs.readFileSync(
  "src/lib/promotions/customer-context.ts",
  "utf8",
);
const rateLimit = fs.readFileSync("src/lib/rate-limit.ts", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const e2eSecurity = fs.readFileSync("tests/e2e/loyalty-security.spec.ts", "utf8");

test("identidade sensível da fidelidade continua exigindo telefone confirmado e vínculo exato", () => {
  assert.match(customerContext, /supabase\.auth\.getUser\(\)/);
  assert.match(customerContext, /auth\.admin\.getUserById/);
  assert.match(customerContext, /phone_confirmed_at/);
  assert.match(customerContext, /verifiedPhone !== context\.normalizedPhone/);
  assert.match(customerContext, /customer_phone_accounts/);
});

test("resgate exige same-origin, idempotência e limites por IP e por usuário verificado", () => {
  assert.match(redeemRoute, /hasTrustedMutationOrigin/);
  assert.match(redeemRoute, /INVALID_REQUEST_ORIGIN/);
  assert.match(redeemRoute, /sec-fetch-site/);
  assert.match(redeemRoute, /idempotency-key/);
  assert.match(redeemRoute, /customer:loyalty:redeem/);
  assert.match(redeemRoute, /customer:loyalty:redeem:verified-user/);
  assert.match(redeemRoute, /identity: context\.authUserId/);
  assert.match(redeemRoute, /limit: 6/);
  assert.match(rateLimit, /identity\?: string/);
  assert.match(rateLimit, /explicitIdentity \|\| getClientIp\(request\)/);
  assert.match(rateLimit, /createHmac\("sha256"/);
});

test("snapshot do resgate é imutável e status terminal não pode ressuscitar", () => {
  assert.match(securityMigration, /guard_loyalty_redemption_integrity/);
  assert.match(securityMigration, /Loyalty redemptions are immutable audit records/);
  assert.match(securityMigration, /Loyalty redemption audit fields are immutable/);
  assert.match(securityMigration, /old\.status <> 'available' and new\.status <> old\.status/);
  assert.match(securityMigration, /Terminal loyalty redemption status cannot transition/);
  assert.match(securityMigration, /Redeemed loyalty order linkage is immutable/);
  assert.match(securityMigration, /Redeemed loyalty order does not belong to this customer/);
  assert.match(securityMigration, /before update or delete on public\.loyalty_redemptions/);
});

test("benefício genérico de origem loyalty fica preso ao snapshot e não pode ser apagado ou reativado", () => {
  assert.match(securityMigration, /guard_loyalty_checkout_benefit_integrity/);
  assert.match(securityMigration, /Issued loyalty checkout benefits are immutable audit records/);
  assert.match(securityMigration, /Loyalty checkout benefit does not match its redemption snapshot/);
  assert.match(securityMigration, /Terminal loyalty checkout benefit status cannot transition/);
  assert.match(securityMigration, /new\.loyalty_redemption_id is distinct from old\.loyalty_redemption_id/);
  assert.match(securityMigration, /before insert or update or delete on public\.customer_rewards/);
});

test("RPCs capazes de descobrir cliente ou debitar pontos continuam exclusivos do service role", () => {
  assert.match(
    securityMigration,
    /revoke all on function public\.redeem_loyalty_reward\(uuid, text, text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    securityMigration,
    /grant execute on function public\.redeem_loyalty_reward\(uuid, text, text\)[\s\S]*to service_role/,
  );
  assert.match(
    securityMigration,
    /revoke all on function public\.find_loyalty_customers_by_phone\(text, uuid\)[\s\S]*from public, anon, authenticated/,
  );
});

test("E2E comercial passa a provar antifraude real da fidelidade", () => {
  assert.match(packageJson, /tests\/e2e\/loyalty-security\.spec\.ts/);
  assert.match(e2eSecurity, /LOYALTY_SESSION_REQUIRED/);
  assert.match(e2eSecurity, /INVALID_REQUEST_ORIGIN/);
  assert.match(e2eSecurity, /directRpc\.error/);
  assert.match(e2eSecurity, /directLedgerMutation\.error/);
  assert.match(e2eSecurity, /concurrentAttempts/);
  assert.match(e2eSecurity, /LOYALTY_INSUFFICIENT_POINTS/);
  assert.match(e2eSecurity, /LOYALTY_IDEMPOTENCY_CONFLICT/);
  assert.match(e2eSecurity, /raceRedemptionCount/);
  assert.match(e2eSecurity, /rewriteBenefit\.error/);
  assert.match(e2eSecurity, /deleteRedemption\.error/);
});
