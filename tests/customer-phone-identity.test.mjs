import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const phonePage = fs.readFileSync("src/app/auth/phone/page.tsx", "utf8");
const authPage = fs.readFileSync("src/app/auth/page.tsx", "utf8");
const linkRoute = fs.readFileSync("src/app/api/customer/phone/link/route.ts", "utf8");
const routing = fs.readFileSync("src/lib/customer-auth-routing.ts", "utf8");
const wheelBridge = fs.readFileSync("src/features/storefront/LuckyWheelStorefrontBridge.tsx", "utf8");
const audit = fs.readFileSync("scripts/audit-service-role.mjs", "utf8");

test("customer phone verification keeps the primary email session and uses an ephemeral OTP client", () => {
  assert.match(phonePage, /createBrowserClient/);
  assert.match(phonePage, /createSupabaseClient/);
  assert.match(phonePage, /persistSession:\s*false/);
  assert.match(phonePage, /autoRefreshToken:\s*false/);
  assert.match(phonePage, /detectSessionInUrl:\s*false/);
  assert.match(phonePage, /signInWithOtp/);
  assert.match(phonePage, /shouldCreateUser:\s*true/);
  assert.match(phonePage, /verifyOtp/);
  assert.match(phonePage, /type:\s*["']sms["']/);
  assert.doesNotMatch(phonePage, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("verified OTP proof is sent to a server-only reconciliation endpoint", () => {
  assert.match(phonePage, /data\.session\?\.access_token/);
  assert.match(phonePage, /\/api\/customer\/phone\/link/);
  assert.match(phonePage, /verificationAccessToken:\s*data\.session\.access_token/);
  assert.match(linkRoute, /createAdminClient/);
  assert.match(linkRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(linkRoute, /adminSupabase\.auth\.getUser\(/);
  assert.match(linkRoute, /phone_confirmed_at/);
  assert.match(linkRoute, /verificationAccessToken\.length > 4096/);
});

test("phone reconciliation only absorbs disposable phone identities and fails closed", () => {
  assert.match(linkRoute, /sourceAuthUser\.email/);
  assert.match(linkRoute, /hasPrivilegedOwnership/);
  assert.match(linkRoute, /sourcePhone !== normalizedPhone/);
  assert.match(linkRoute, /throw sourceAuthError/);
  assert.match(linkRoute, /auth\.admin\.deleteUser\(sourceUserId\)/);
  assert.match(linkRoute, /auth\.admin\.updateUserById\(currentUser\.id/);
  assert.match(linkRoute, /phone_confirm:\s*true/);
});

test("legacy customer data is moved to the authenticated account before the disposable user is removed", () => {
  const migrationIndex = linkRoute.indexOf("migrateDisposableCustomerIdentity");
  const deleteIndex = linkRoute.indexOf("deleteUser(sourceUserId)");
  assert.ok(migrationIndex >= 0);
  assert.ok(deleteIndex > migrationIndex);
  assert.match(linkRoute, /from\(["']customer_addresses["']\)\.update\(\{ user_id: targetUserId \}\)/);
  assert.match(linkRoute, /from\(["']customer_phone_sessions["']\)\.update\(\{ auth_user_id: targetUserId \}\)/);
  assert.match(linkRoute, /from\(["']orders["']\)\.update\(\{ user_id: targetUserId \}\)/);
  assert.match(linkRoute, /from\(["']reviews["']\)\.update\(\{ user_id: targetUserId \}\)/);
  assert.match(linkRoute, /from\(["']customer_phone_accounts["']\)/);
  assert.match(linkRoute, /from\(["']profiles["']\)\.upsert/);
});

test("customer return URLs stay internal and survive login plus phone verification", () => {
  assert.match(routing, /candidate\.startsWith\(["']\/["']\)/);
  assert.match(routing, /candidate\.startsWith\(["']\/\/["']\)/);
  assert.match(routing, /encodeURIComponent\(sanitizeCustomerReturnUrl\(returnUrl\)\)/);
  assert.match(authPage, /sanitizeCustomerReturnUrl/);
  assert.match(authPage, /buildCustomerPhoneVerificationUrl\(returnUrl\)/);
  assert.doesNotMatch(authPage, /decodeURIComponent\(returnUrl\)/);
  assert.match(phonePage, /router\.replace\(returnUrl\)/);
});

test("benefits and pending wheel state are refreshed after phone confirmation", () => {
  assert.match(phonePage, /supabase\.auth\.refreshSession\(\)/);
  assert.match(phonePage, /router\.replace\(returnUrl\)/);
  assert.match(phonePage, /router\.refresh\(\)/);
  assert.match(wheelBridge, /gestor-delivery:last-order:/);
  assert.match(wheelBridge, /\/api\/storefront\/promotions\/wheel\/eligibility/);
});

test("wheel identity guidance opens the phone verification flow without creating a fake spin", () => {
  assert.match(wheelBridge, /\/auth\/phone\?returnUrl=/);
  assert.match(wheelBridge, /Confirmar telefone/);
  assert.match(wheelBridge, /if \(payload\.spin\)/);
  assert.match(wheelBridge, /Você ganhou um giro!/);
  assert.doesNotMatch(wheelBridge, /Math\.random/);
});

test("service-role audit recognizes cross-store customer identity as its own protected route class", () => {
  assert.match(audit, /CUSTOMER_IDENTITY_ROUTE_PATTERN/);
  assert.match(audit, /customer-identity-route/);
  assert.match(audit, /safe = authenticatesUser && hasPublicProtection/);
});
