"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const migration=fs.readFileSync("supabase/migrations/20261024101000_ifood_event_lease_replay.sql","utf8");
const replay=fs.readFileSync("src/lib/ifood/event-replay.ts","utf8");
const resilience=fs.readFileSync("src/lib/ifood/order-sync-resilience.ts","utf8");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
test("atomic database claim limits one event to one worker until lease expiry",()=>{
  assert.match(migration,/for update of e skip locked/i);
  assert.match(migration,/processing_lease_token = gen_random_uuid\(\)/);
  assert.match(migration,/processing_lease_until = now\(\) \+ interval '150 seconds'/);
  assert.match(migration,/processing_lease_until <= now\(\)/);
  assert.match(migration,/e\.restaurant_id = p_restaurant_id/);
  assert.match(migration,/e\.merchant_id = p_merchant_id/);
  assert.match(migration,/i\.order_sync_enabled = true/);
});
test("claim RPC is only executable via service role",()=>{
  assert.match(migration,/security invoker/i);
  assert.match(migration,/revoke all on function public\.claim_ifood_pending_events[\s\S]+from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.claim_ifood_pending_events[\s\S]+to service_role/i);
});
test("replay requires unexpired ownership token to mark event",()=>{
  assert.match(replay,/\.eq\("processing_lease_token", row\.processing_lease_token\)/);
  assert.match(replay,/\.gt\("processing_lease_until", new Date\(\)\.toISOString\(\)\)/);
  assert.match(replay,/if \(!marked\?\.id\)/);
  assert.match(replay,/processed_at: new Date\(\)\.toISOString\(\)/);
  assert.match(replay,/if \(!updated\?\.id\)/);
});
test("feature is off by default; ACK recovery runs before polling when enabled",()=>{
  assert.match(replay,/IFOOD_PERSISTED_REPLAY_ENABLED === "true"/);
  assert.match(resilience,/replayStoredIfoodEvents\(params\.restaurantId, params\.merchantId\)/);
  assert.match(resilience,/earlyAcknowledgementsRecovered = await recoverPendingAcknowledgements/);
});
test("CI checks actual database leases in isolated Supabase",()=>{
  assert.match(ci,/node scripts\/test-ifood-event-leases\.mjs/);
});
