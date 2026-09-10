import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const phonePage = fs.readFileSync("src/app/auth/phone/page.tsx", "utf8");
const hook = fs.readFileSync("supabase/functions/send-phone-otp-whatsapp/index.ts", "utf8");
const linkRoute = fs.readFileSync("src/app/api/customer/phone/link/route.ts", "utf8");

test("WhatsApp delivery remains a transport layer while Supabase owns OTP verification", () => {
  assert.match(phonePage, /signInWithOtp/);
  assert.match(phonePage, /verifyOtp/);
  assert.match(phonePage, /type:\s*["']sms["']/);
  assert.match(phonePage, /verificationAccessToken:\s*data\.session\.access_token/);
  assert.match(linkRoute, /adminSupabase\.auth\.getUser\(/);
  assert.match(linkRoute, /phone_confirmed_at/);
});

test("Send SMS hook verifies the signed Supabase webhook before exposing the OTP to transport", () => {
  assert.match(hook, /standardwebhooks/);
  assert.match(hook, /new Webhook\(secret\)\.verify/);
  assert.match(hook, /SEND_SMS_HOOK_SECRET/);
  assert.match(hook, /invalid_signature/);
  assert.match(hook, /configuredSecrets\.split\(["']\|["']\)/);
});

test("OTP WhatsApp hook is Brazil-only, six-digit, HTTPS-only and fail-closed", () => {
  assert.match(hook, /\^\\\+55\\d\{10,11\}\$/);
  assert.match(hook, /\^\\d\{6\}\$/);
  assert.match(hook, /parsed\.protocol !== ["']https:["']/);
  assert.match(hook, /WHATSAPP_BOT_API_URL/);
  assert.match(hook, /WHATSAPP_BOT_API_TOKEN/);
  assert.match(hook, /Authorization:\s*`Bearer \$\{whatsappApiToken\}`/);
  assert.match(hook, /AbortSignal\.timeout/);
  assert.match(hook, /if \(!upstreamResponse\.ok\)/);
});

test("OTP and complete phone are never written to application logs by the hook", () => {
  const loggingCalls = hook.match(/console\.(?:log|info|warn|error)\([^;]+;/gs) || [];
  for (const loggingCall of loggingCalls) {
    assert.doesNotMatch(loggingCall, /\botp\b/i);
    assert.doesNotMatch(loggingCall, /\bphone\b/i);
  }
});
