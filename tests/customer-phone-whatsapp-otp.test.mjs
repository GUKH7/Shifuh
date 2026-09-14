import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const phonePage = fs.readFileSync("src/app/auth/phone/page.tsx", "utf8");
const hook = fs.readFileSync("supabase/functions/send-phone-otp-whatsapp/index.ts", "utf8");
const otpRoute = fs.readFileSync("src/app/api/customer/phone/otp-route/route.ts", "utf8");
const linkRoute = fs.readFileSync("src/app/api/customer/phone/link/route.ts", "utf8");
const oracleApi = fs.readFileSync("ops/oracle/whatsapp-api/index.js", "utf8");

test("WhatsApp delivery remains a transport layer while Supabase owns OTP verification", () => {
  assert.match(phonePage, /signInWithOtp/);
  assert.match(phonePage, /verifyOtp/);
  assert.match(phonePage, /type:\s*["']sms["']/);
  assert.match(phonePage, /verificationAccessToken:\s*data\.session\.access_token/);
  assert.match(linkRoute, /adminSupabase\.auth\.getUser\(/);
  assert.match(linkRoute, /phone_confirmed_at/);
});

test("customer UI prepares restaurant routing before requesting the Supabase OTP", () => {
  const routeCallIndex = phonePage.indexOf('/api/customer/phone/otp-route');
  const otpCallIndex = phonePage.indexOf('verifier.auth.signInWithOtp');

  assert.ok(routeCallIndex >= 0, "restaurant OTP routing endpoint must be called");
  assert.ok(otpCallIndex > routeCallIndex, "restaurant context must be prepared before OTP generation");
  assert.match(phonePage, /Enviar código pelo WhatsApp/);
  assert.match(phonePage, /WhatsApp do restaurante/);
  assert.doesNotMatch(phonePage, /Enviar código por SMS/);
});

test("restaurant routing context is authenticated, short-lived and resolved server-side from storefront slug", () => {
  assert.match(otpRoute, /hasTrustedMutationOrigin/);
  assert.match(otpRoute, /checkRateLimit/);
  assert.match(otpRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(otpRoute, /sanitizeCustomerReturnUrl/);
  assert.match(otpRoute, /\.from\(["']restaurants["']\)/);
  assert.match(otpRoute, /\.eq\(["']slug["'],\s*storefrontSlug\)/);
  assert.match(otpRoute, /customer_phone_otp_routes/);
  assert.match(otpRoute, /5 \* 60_000/);
  assert.doesNotMatch(otpRoute, /restaurantId\s*=\s*body\./);
});

test("Send SMS hook verifies the signed Supabase webhook before exposing the OTP to transport", () => {
  assert.match(hook, /standardwebhooks/);
  assert.match(hook, /new Webhook\(secret\)\.verify/);
  assert.match(hook, /SEND_SMS_HOOK_SECRET/);
  assert.match(hook, /Assinatura do Send SMS Hook invalida/);
  assert.match(hook, /configuredSecrets\s*\.split\(["']\|["']\)/);
});

test("OTP hook requires a live restaurant route and only calls restaurant-scoped WhatsApp endpoint", () => {
  assert.match(hook, /customer_phone_otp_routes/);
  assert.match(hook, /restaurant_id/);
  assert.match(hook, /consumed_at/);
  assert.match(hook, /expires_at/);
  assert.match(hook, /\/restaurants\/\$\{encodeURIComponent\(restaurantId\)\}\/send-message/);
  assert.match(hook, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(hook, /Authorization:\s*`Bearer \$\{whatsappApiToken\}`/);
  assert.match(hook, /parsed\.protocol !== ["']https:["']/);
  assert.match(hook, /AbortSignal\.timeout/);
  assert.doesNotMatch(hook, /DEFAULT_SEND_PATH/);
  assert.doesNotMatch(hook, /EdgeRuntime\.waitUntil/);
});

test("OTP hook accepts only Brazilian phones and six-digit codes", () => {
  assert.match(hook, /\^55\\d\{10,11\}\$/);
  assert.match(hook, /\^\\d\{6\}\$/);
});

test("OTP value and complete phone are never written to application logs by the hook", () => {
  const loggingCalls = hook.match(/console\.(?:log|info|warn|error)\([^;]+;/gs) || [];
  for (const loggingCall of loggingCalls) {
    assert.doesNotMatch(loggingCall, /\$\{otp\}|,\s*otp\b|\botp\s*[,}]/);
    assert.doesNotMatch(loggingCall, /\$\{phone\}|,\s*phone\b|\bphone\s*[,}]/);
  }
});

test("Oracle exposes isolated WhatsApp lifecycle and send routes per restaurant", () => {
  assert.match(oracleApi, /RESTAURANT_ID_PATTERN/);
  assert.match(oracleApi, /baileys_restaurant_sessions/);
  assert.match(oracleApi, /restaurantSessions = new Map\(\)/);
  assert.match(oracleApi, /path\.join\(RESTAURANT_AUTH_ROOT, restaurantId\)/);
  assert.match(oracleApi, /\/restaurants\/:restaurantId\/status/);
  assert.match(oracleApi, /\/restaurants\/:restaurantId\/restart/);
  assert.match(oracleApi, /\/restaurants\/:restaurantId\/send-message/);
  assert.match(oracleApi, /session\.sock/);
  assert.match(oracleApi, /session\.status !== ['"]conectado['"]/);
});
