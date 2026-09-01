import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storefrontRoute = fs.readFileSync("src/app/[slug]/page.tsx", "utf8");
const bridge = fs.readFileSync("src/features/storefront/LuckyWheelStorefrontBridge.tsx", "utf8");
const wheelApi = fs.readFileSync("src/app/api/storefront/promotions/wheel/route.ts", "utf8");
const eligibilityApi = fs.readFileSync("src/app/api/storefront/promotions/wheel/eligibility/route.ts", "utf8");
const rewardsApi = fs.readFileSync("src/app/api/customer/rewards/route.ts", "utf8");
const rewardsPage = fs.readFileSync("src/app/minha-conta/premios/page.tsx", "utf8");
const adminWheelPage = fs.readFileSync("src/app/admin/(painel)/promotions/wheel/page.tsx", "utf8");
const adminWorkspace = fs.readFileSync("src/app/admin/(painel)/promotions/wheel/WheelCampaignWorkspace.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260901144413_promotion_wheel_server_engine.sql", "utf8");
const qualificationFix = fs.readFileSync("supabase/migrations/20260901145344_fix_promotion_wheel_server_engine_qualification.sql", "utf8");
const adminPersistence = fs.readFileSync("supabase/migrations/20260901150925_connect_wheel_admin_persistence.sql", "utf8");

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

test("admin wheel workspace persists campaigns, rules and real menu product prizes", () => {
  assert.match(adminWheelPage, /WheelCampaignWorkspace/);
  assert.match(adminWorkspace, /rpc\("save_promotion_wheel_campaign"/);
  assert.match(adminWorkspace, /from\("promotion_campaigns"\)/);
  assert.match(adminWorkspace, /from\("promotion_eligibility_rules"\)/);
  assert.match(adminWorkspace, /from\("promotion_prizes"\)/);
  assert.match(adminWorkspace, /from\("products"\)/);
  assert.match(adminWorkspace, /product_id: prize\.type === "free_product" \? prize\.productId : null/);
});

test("admin save RPC is transactional under authenticated RLS", () => {
  assert.match(adminPersistence, /create or replace function public\.save_promotion_wheel_campaign/);
  assert.match(adminPersistence, /security invoker/);
  assert.match(adminPersistence, /Restaurant membership required/);
  assert.match(adminPersistence, /grant execute on function public\.save_promotion_wheel_campaign\(uuid, uuid, jsonb, jsonb, jsonb\) to authenticated/);
  assert.match(adminPersistence, /Free product prize must reference an active restaurant product/);
});

test("eligibility uses OR for unlock rules and AND for guard rules", () => {
  assert.match(adminPersistence, /v_unlock_passed boolean := false/);
  assert.match(adminPersistence, /v_rule\.rule_type in \('schedule', 'customer_spin_limit'\)/);
  assert.match(adminPersistence, /v_unlock_passed := true/);
  assert.match(adminPersistence, /v_unlock_rule_count = 0 or not v_unlock_passed/);
});
