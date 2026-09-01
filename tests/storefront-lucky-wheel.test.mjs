import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storefrontRoute = fs.readFileSync("src/app/[slug]/page.tsx", "utf8");
const bridge = fs.readFileSync("src/features/storefront/LuckyWheelStorefrontBridge.tsx", "utf8");
const wheelApi = fs.readFileSync("src/app/api/storefront/promotions/wheel/route.ts", "utf8");
const eligibilityApi = fs.readFileSync("src/app/api/storefront/promotions/wheel/eligibility/route.ts", "utf8");
const rewardsApi = fs.readFileSync("src/app/api/customer/rewards/route.ts", "utf8");
const rewardsPage = fs.readFileSync("src/app/minha-conta/premios/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260901144413_promotion_wheel_server_engine.sql", "utf8");
const qualificationFix = fs.readFileSync("supabase/migrations/20260901145344_fix_promotion_wheel_server_engine_qualification.sql", "utf8");

test("storefront mounts the isolated lucky wheel bridge", () => {
  assert.match(storefrontRoute, /LuckyWheelStorefrontBridge/);
  assert.match(storefrontRoute, /<StorefrontPage \/>/);
});

test("customer wheel checks eligibility after checkout and never receives distribution weights", () => {
  assert.match(bridge, /\/api\/storefront\/promotions\/wheel\/eligibility/);
  assert.match(bridge, /gestor-delivery:last-order:/);
  assert.match(eligibilityApi, /grant_eligible_promotion_spin/);
  assert.match(eligibilityApi, /select\("id, label, prize_type, sort_order"\)/);
  assert.doesNotMatch(eligibilityApi, /select\([^\n]*probability/);
  assert.doesNotMatch(eligibilityApi, /select\([^\n]*frequency_every/);
});

test("frontend animates to the prize id returned by the server", () => {
  assert.match(bridge, /serverResult\.prizeId/);
  assert.match(bridge, /findIndex\(\(segment\) => segment\.id === serverResult\.prizeId\)/);
  assert.match(wheelApi, /adminSupabase\.rpc\("resolve_promotion_spin"/);
  assert.doesNotMatch(bridge, /Math\.random/);
});

test("server engine is restricted to service role and persists before reveal", () => {
  assert.match(migration, /revoke all on function public\.grant_eligible_promotion_spin\(uuid, uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.grant_eligible_promotion_spin\(uuid, uuid, uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.resolve_promotion_spin\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.resolve_promotion_spin\(uuid\) to service_role/);
  assert.match(migration, /for update/);
  assert.match(migration, /insert into public\.promotion_spin_results/);
});

test("server engine qualifies returned column names to avoid PL/pgSQL ambiguity", () => {
  assert.match(qualificationFix, /where er\.campaign_id = v_campaign\.id/);
  assert.match(qualificationFix, /where psr\.spin_id = v_spin\.id/);
  assert.match(qualificationFix, /select pc\.\* into v_campaign/);
});

test("customer rewards wallet is exposed through a server endpoint", () => {
  assert.match(rewardsPage, /\/api\/customer\/rewards/);
  assert.match(rewardsPage, /Meus prêmios/);
  assert.match(rewardsApi, /resolveCustomerPromotionContext/);
  assert.match(rewardsApi, /from\("customer_rewards"\)/);
});
