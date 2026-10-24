"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
const script=fs.readFileSync("scripts/ifood-replay-homologation.cjs","utf8");
const leases=fs.readFileSync("scripts/test-ifood-event-leases.mjs","utf8");

test("failure-matrix E2E runs only with isolated local Supabase and mock providers",()=>{
  assert.match(ci,/IFOOD_REPLAY_HOMOLOGATION: "1"/);
  assert.match(ci,/IFOOD_PERSISTED_REPLAY_ENABLED: "true"/);
  assert.match(ci,/run: node scripts\/ifood-replay-homologation\.cjs/);
  assert.match(script,/\["127\.0\.0\.1", "localhost"\]/);
  assert.match(script,/getIfoodOrderDetails: async oid => orderDetails\(oid\)/);
  assert.match(script,/acknowledgeIfoodOrderEvents: async ids =>/);
});
test("matrix exercises repeated recoverable outages without burning permanent retries",()=>{
  assert.match(script,/const offlineAttempts = 8/);
  assert.match(script,/next_retry_at: new Date\(Date\.now\(\) - 1000\)/);
  assert.match(script,/Long outages must never burn permanent retry budget/);
  assert.match(script,/Long outages must never dead-letter recoverable events/);
  assert.match(script,/afterRecovery\.claimed,0/);
});
test("matrix exercises ACK transport failure, 100-sized batches, and idempotent recovery",()=>{
  assert.match(script,/ackFailuresRemaining = 2/);
  assert.match(script,/length:104/);
  assert.match(script,/await assert\.rejects\(resilience\.syncIfoodOrdersWithResilience/);
  assert.match(script,/\[100,7\]/);
  assert.match(script,/Already ACKed IDs must not be resent/);
});
test("isolated Postgres tests distributed batch leases and disabled merchants",()=>{
  assert.match(leases,/length:12/);
  assert.match(leases,/p_batch_size:999/);
  assert.match(leases,/Batch size capped at 10/);
  assert.match(leases,/order_sync_enabled:false/);
  assert.match(leases,/Disabled integrations cannot lease/);
});
