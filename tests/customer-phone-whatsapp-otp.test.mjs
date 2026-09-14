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
  assert.match(hook, /configuredSecrets\s*\.split\(["']\|["']\)/);
});

test("Send SMS hook strips the complete Supabase Standard Webhooks prefix before verification", () => {
  assert.match(hook, /STANDARD_WEBHOOK_SECRET_PREFIX\s*=\s*["']v1,whsec_["']/);
  assert.match(hook, /trimmed\.startsWith\(STANDARD_WEBHOOK_SECRET_PREFIX\)/);
  assert.match(hook, /trimmed\.slice\(STANDARD_WEBHOOK_SECRET_PREFIX\.length\)/);
});

test("OTP WhatsApp hook is Brazil-only, six-digit, HTTPS-only and fail-closed", () => {
  assert.match(hook, /\^\\\+55\\d\{10,11\}\$/);
  assert.match(hook, /\^\\d\{6\}\$/);
  assert.match(hook, /parsed\.protocol !== ["']https:["']/);
  assert.match(hook, /WHATSAPP_BOT_API_URL/);
  assert.match(hook, /WHATSAPP_BOT_API_TOKEN/);
  assert.match(hook, /Authorization:\s*`Bearer \$\{apiToken\}`/);
  assert.match(hook, /AbortSignal\.timeout/);
  assert.match(hook, /if \(!upstreamResponse\.ok\)/);
});

test("Auth hook checks transport synchronously but sends the OTP outside the five-second response path", () => {
  assert.match(hook, /DEFAULT_STATUS_PATH\s*=\s*["']\/status["']/);
  assert.match(hook, /PREFLIGHT_TIMEOUT_MS\s*=\s*2_000/);
  assert.match(hook, /payload\.status === ["']conectado["']/);
  assert.match(hook, /if \(!\(await isWhatsappReady\(/);
  assert.match(hook, /EdgeRuntime\.waitUntil\(/);
  assert.match(hook, /deliverWhatsappOtp\(/);
  assert.doesNotMatch(hook, /await\s+deliverWhatsappOtp\(/);
});

test("OTP value and complete phone are never written to application logs by the hook", () => {
  const loggingCalls = hook.match(/console\.(?:log|info|warn|error)\([^;]+;/gs) || [];
  for (const loggingCall of loggingCalls) {
    assert.doesNotMatch(loggingCall, /\$\{otp\}|,\s*otp\b|\botp\s*[,}]/);
    assert.doesNotMatch(loggingCall, /\$\{phone\}|,\s*phone\b|\bphone\s*[,}]/);
  }
});