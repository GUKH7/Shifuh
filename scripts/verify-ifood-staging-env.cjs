"use strict";
// Read-only preflight. Never connects to Supabase, iFood or WhatsApp.
const PRODUCTION_SUPABASE_REF = "inpnszjwuwefitljrzrd";
function verify(env) {
  const failures = [];
  const ref = String(env.SHIFUH_STAGING_SUPABASE_REF || "").trim();
  if (env.SHIFUH_ENV !== "staging") failures.push("SHIFUH_ENV must equal staging");
  if (!/^[a-z0-9]{20}$/.test(ref)) failures.push("Invalid SHIFUH_STAGING_SUPABASE_REF");
  if (ref === PRODUCTION_SUPABASE_REF || (env.SHIFUH_PRODUCTION_SUPABASE_REF && ref === env.SHIFUH_PRODUCTION_SUPABASE_REF)) {
    failures.push("Production Supabase is forbidden");
  }
  let url;
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || ""); }
  catch { failures.push("Invalid NEXT_PUBLIC_SUPABASE_URL"); }
  if (url && (url.protocol !== "https:" || url.hostname !== ref + ".supabase.co" || url.username || url.password || (url.port && url.port !== "443"))) {
    failures.push("Supabase URL must point to the isolated staging ref over HTTPS");
  }
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) failures.push("Missing branch anon key");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) failures.push("Missing branch service key");
  if (env.SHIFUH_STAGING_SERVICE_ROLE_VERIFIED !== "true") {
    failures.push("Branch service key must be independently verified");
  }
  const hasIfoodCredentials = Boolean(env.IFOOD_CLIENT_ID || env.IFOOD_CLIENT_SECRET);
  const replayEnabled = env.IFOOD_PERSISTED_REPLAY_ENABLED === "true";
  if (hasIfoodCredentials || replayEnabled) {
    let api;
    try { api = new URL(env.IFOOD_MERCHANT_API_BASE_URL || ""); }
    catch { failures.push("Mock iFood API URL required"); }
    if (api && !["localhost", "127.0.0.1"].includes(api.hostname) && !api.hostname.endsWith(".internal.test")) {
      failures.push("Live iFood API forbidden during staging");
    }
    if (env.IFOOD_AUTH_URL) {
      try {
        const auth = new URL(env.IFOOD_AUTH_URL);
        if (!api || auth.origin !== api.origin) failures.push("iFood auth must use mock origin");
      } catch { failures.push("Invalid iFood mock auth URL"); }
    }
  }
  if (env.WHATSAPP_BOT_API_URL) failures.push("Real WhatsApp bot forbidden in staging");
  if (replayEnabled) {
    if (env.SHIFUH_STAGING_LEASE_MIGRATION_VERIFIED !== "true") failures.push("Lease migration unverified");
    if (env.SHIFUH_STAGING_REPLAY_APPROVED !== "true") failures.push("Staging replay not authorized");
  }
  if (failures.length) throw new Error("Staging preflight blocked: " + failures.join("; "));
  return { environment: "staging", projectRef: ref, replayEnabled };
}
module.exports = {verify,PRODUCTION_SUPABASE_REF};
if (require.main === module) {
  try { console.log(JSON.stringify(verify(process.env))); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
