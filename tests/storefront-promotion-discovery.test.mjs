import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  "src/app/api/storefront/promotions/summary/route.ts",
  "utf8",
);
const formatter = fs.readFileSync(
  "src/lib/promotions/storefront-promotion-summary.ts",
  "utf8",
);
const bridge = fs.readFileSync(
  "src/features/storefront/StorefrontPromotionDiscoveryBridge.tsx",
  "utf8",
);
const storefrontBridges = fs.readFileSync(
  "src/features/storefront/StorefrontBridges.tsx",
  "utf8",
);
const serviceRoleAudit = fs.readFileSync("scripts/audit-service-role.mjs", "utf8");

test("public promotion summary is rate-limited, tenant-scoped and exposes only active mechanics", () => {
  assert.match(route, /checkRateLimit/);
  assert.match(route, /\.eq\("slug", slug\)/);
  assert.match(route, /\.eq\("restaurant_id", restaurant\.id\)/);
  assert.match(route, /from\("loyalty_programs"\)/);
  assert.match(route, /from\("promotion_campaigns"\)/);
  assert.match(route, /from\("promotion_eligibility_rules"\)/);
  assert.match(route, /\.eq\("status", "active"\)/);
  assert.match(route, /\.lte\("starts_at", now\)/);
  assert.match(route, /\.gt\("ends_at", now\)/);
  assert.doesNotMatch(route, /from\("promotion_prizes"\)/);
  assert.doesNotMatch(route, /probability|frequency_every|distribution_mode/);
  assert.match(serviceRoleAudit, /promotions\\\/summary\\\/route/);
});

test("loyalty copy is derived from spend or order configuration and keeps minimum order compact", () => {
  assert.match(formatter, /program\.earning_mode === "spend"/);
  assert.match(formatter, /program\.earning_mode === "order"/);
  assert.match(formatter, /program\.points_per_spend/);
  assert.match(formatter, /program\.points_per_order/);
  assert.match(formatter, /program\.minimum_order_amount/);
  assert.match(formatter, /Ganhe \$\{points\} \$\{pointLabel\(points\)\} a cada/);
  assert.match(formatter, /Pedidos a partir de \$\{formatPromotionMoney\(minimumOrder\)\} acumulam pontos/);
});

test("wheel copy covers every real unlock rule and keeps guards separate", () => {
  for (const rule of [
    "completed_order",
    "minimum_order",
    "every_orders",
    "spend_threshold",
    "first_purchase",
    "schedule",
    "customer_spin_limit",
  ]) {
    assert.match(formatter, new RegExp(rule));
  }
  assert.match(formatter, /Faça um pedido e ganhe uma chance de girar/);
  assert.match(formatter, /liberam um giro/);
  assert.match(formatter, /você ganha uma chance na Roleta/);
  assert.match(formatter, /Válido/);
  assert.match(formatter, /Até \$\{maxSpins\}/);
  assert.match(formatter, /joinAlternatives/);
});

test("storefront renders active loyalty and wheel in one compact area before category navigation", () => {
  assert.match(storefrontBridges, /StorefrontPromotionDiscoveryBridge/);
  assert.match(bridge, /\[data-catalog-nav\]/);
  assert.match(bridge, /insertBefore\(target, catalogNavigation\)/);
  assert.match(bridge, /aria-label="Promoções da loja"/);
  assert.match(bridge, /promotions\.map/);
  assert.match(bridge, /index > 0 \? "border-t border-orange-100"/);
});
