const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const limiter = fs.readFileSync(path.join(root, "src/lib/rate-limit.ts"), "utf8");

test("rate limit usa contador distribuído e não mantém buckets no processo", () => {
  assert.match(limiter, /export async function checkRateLimit/);
  assert.match(limiter, /consume_api_rate_limit/);
  assert.match(limiter, /createAdminClient/);
  assert.match(limiter, /createHmac\("sha256"/);
  assert.doesNotMatch(limiter, /new Map/);
  assert.doesNotMatch(limiter, /const buckets/);
});

test("rotas críticas aguardam o limiter e login está protegido", () => {
  const routes = [
    "src/app/api/orders/route.ts",
    "src/app/api/storefront/delivery-quote/route.ts",
    "src/app/api/storefront/postal-code/route.ts",
    "src/app/api/storefront/checkout-events/route.ts",
    "src/app/api/reviews/route.ts",
    "src/app/api/orders/[id]/tracking/route.ts",
    "src/app/api/admin/login/route.ts",
  ];
  for (const route of routes) {
    const source = fs.readFileSync(path.join(root, route), "utf8");
    assert.match(source, /await checkRateLimit\(request,/i, route);
  }
  const login = fs.readFileSync(path.join(root, "src/app/api/admin/login/route.ts"), "utf8");
  assert.match(login, /keyPrefix: "admin:login"/);
});

test("estado do limiter não é acessível por clientes Supabase", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260816142608_distributed_api_rate_limits.sql"), "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.api_rate_limits from public, anon, authenticated/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /grant execute on function public\.consume_api_rate_limit[^;]+to service_role/is);
});
