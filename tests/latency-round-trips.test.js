const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const serverData = read("src/features/storefront/server-data.ts");
const adminLayout = read("src/app/admin/(painel)/layout.tsx");
const adminSidebar = read("src/components/admin-sidebar.tsx");
const adminContextRoute = read("src/app/api/admin/context/route.ts");
const restaurantHelper = read("src/lib/supabase/restaurant.ts");
const migration = read("supabase/migrations/20260823131000_latency_context_bundles.sql");

test("storefront SSR uses one bundled database RPC", () => {
  assert.equal((serverData.match(/\.rpc\(/g) || []).length, 1);
  assert.match(serverData, /get_public_storefront_bundle/);
  assert.doesNotMatch(serverData, /\.from\(/);
});

test("admin layout resolves navigation and authorization through one context endpoint", () => {
  assert.match(adminLayout, /fetch\("\/api\/admin\/context"/);
  assert.doesNotMatch(adminLayout, /createBrowserClient/);
  assert.doesNotMatch(adminLayout, /getRestaurantByUserId/);
  assert.doesNotMatch(adminLayout, /\/api\/platform\/access/);
});

test("admin sidebar reuses context instead of issuing its own startup requests", () => {
  assert.match(adminSidebar, /storeSlug: string/);
  assert.match(adminSidebar, /canAccessPlatform: boolean/);
  assert.doesNotMatch(adminSidebar, /getCurrentRestaurant/);
  assert.doesNotMatch(adminSidebar, /\/api\/platform\/access/);
  assert.doesNotMatch(adminSidebar, /useEffect/);
});

test("admin context endpoint verifies auth then performs one bundled service-role RPC", () => {
  assert.match(adminContextRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(adminContextRoute, /get_admin_navigation_context_admin/);
  assert.equal((adminContextRoute.match(/\.rpc\(/g) || []).length, 1);
  assert.doesNotMatch(adminContextRoute, /\.from\(/);
});

test("restaurant helper joins membership and restaurant in one PostgREST request", () => {
  assert.match(restaurantHelper, /restaurant:restaurants\(\*\)/);
  const contextStart = restaurantHelper.indexOf("async function getRestaurantContextByUserId");
  const membershipsStart = restaurantHelper.indexOf("export async function getRestaurantMembershipsByUserId");
  const contextBody = restaurantHelper.slice(contextStart, membershipsStart);
  assert.equal((contextBody.match(/\.from\(/g) || []).length, 1);
  assert.doesNotMatch(contextBody, /\.from\("restaurants"\)/);
});

test("latency RPCs preserve least privilege", () => {
  assert.match(migration, /security definer[\s\S]*app_private\.get_public_storefront_bundle/s);
  assert.match(migration, /public\.get_public_storefront_bundle[\s\S]*security invoker/s);
  assert.match(migration, /get_admin_navigation_context_admin[\s\S]*security invoker/s);
  assert.match(
    migration,
    /revoke all on function public\.get_admin_navigation_context_admin\(uuid\)[\s\S]*from public, anon, authenticated, service_role;/s,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_admin_navigation_context_admin\(uuid\)[\s\S]*to service_role;/s,
  );
});
