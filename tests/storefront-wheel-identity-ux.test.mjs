import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const contextSource = fs.readFileSync("src/lib/promotions/customer-context.ts", "utf8");
const eligibilitySource = fs.readFileSync("src/app/api/storefront/promotions/wheel/eligibility/route.ts", "utf8");
const bridgeSource = fs.readFileSync("src/features/storefront/LuckyWheelStorefrontBridge.tsx", "utf8");

test("wheel identity guidance reports only safe account states", () => {
  assert.match(contextSource, /CustomerPromotionIdentityStatus/);
  assert.match(contextSource, /"unauthenticated"/);
  assert.match(contextSource, /"phone_unverified"/);
  assert.match(contextSource, /"phone_account_missing"/);
  assert.match(contextSource, /"phone_mismatch"/);
  assert.match(contextSource, /phone_confirmed_at/);
  assert.match(contextSource, /verifiedPhone !== accountPhone/);
  assert.doesNotMatch(eligibilitySource, /identityStatus.*phone:/);
});

test("eligibility explains invalid identity without granting or exposing a spin", () => {
  assert.match(eligibilitySource, /getCustomerPromotionIdentityStatus/);
  assert.match(eligibilitySource, /\{ spin: null, identityStatus \}/);
  assert.match(eligibilitySource, /resolveCustomerPromotionContext/);
  assert.match(eligibilitySource, /grant_eligible_promotion_spin/);
});

test("storefront keeps the lucky-wheel trigger exclusive to a real pending spin", () => {
  assert.match(bridgeSource, /\{spin && !open && \(/);
  assert.match(bridgeSource, /Você ganhou um giro!/);
  assert.match(bridgeSource, /showIdentityNotice = Boolean\(identityIssue && !identityNoticeDismissed && !spin && !open\)/);
  assert.match(bridgeSource, /Ação necessária para participar da Roleta/);
});

test("storefront guides login or phone confirmation and preserves the storefront return url", () => {
  assert.match(bridgeSource, /Entre para validar sua chance na Roleta/);
  assert.match(bridgeSource, /Confirme seu telefone para validar a Roleta/);
  assert.match(bridgeSource, /\/auth\?returnUrl=\$\{encodeURIComponent\(pathname\)\}/);
  assert.match(bridgeSource, /router\.push\("\/minha-conta"\)/);
  assert.match(bridgeSource, /Dispensar aviso da Roleta/);
});
