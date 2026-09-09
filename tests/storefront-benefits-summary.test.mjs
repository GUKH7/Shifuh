import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridge = fs.readFileSync(
  "src/features/storefront/StorefrontAccountAccessBridge.tsx",
  "utf8",
);
const summaryApi = fs.readFileSync(
  "src/app/api/customer/benefits-summary/route.ts",
  "utf8",
);

test("storefront benefits summary is scoped to the current store", () => {
  assert.match(bridge, /\/api\/customer\/benefits-summary\?slug=/);
  assert.match(summaryApi, /resolveCustomerPromotionContext/);
  assert.match(summaryApi, /\.eq\("slug", slug\)/);
  assert.match(summaryApi, /p_restaurant_id: restaurant\.id/);
  assert.match(summaryApi, /from\("loyalty_accounts"\)/);
  assert.match(summaryApi, /from\("customer_rewards"\)/);
  assert.match(summaryApi, /\.eq\("restaurant_id", restaurant\.id\)/);
  assert.match(summaryApi, /\.eq\("status", "available"\)/);
});

test("authenticated storefront exposes compact benefit states and destinations", () => {
  assert.match(bridge, /Carregando benefícios/);
  assert.match(bridge, /Benefícios indisponíveis/);
  assert.match(bridge, /Sem benefícios nesta loja/);
  assert.match(bridge, /hasPoints && hasRewards/);
  assert.match(bridge, /benefits\.pointsBalance > 0/);
  assert.match(bridge, /benefits\.availableRewards > 0/);
  assert.match(bridge, /router\.push\("\/minha-conta\/fidelidade"\)/);
  assert.match(bridge, /router\.push\("\/minha-conta\/premios"\)/);
});

test("visitor CTA from storefront account access remains intact", () => {
  assert.match(bridge, /Entre para acumular pontos e ganhar recompensas/);
  assert.match(bridge, /\/auth\?returnUrl=/);
});
