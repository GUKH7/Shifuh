"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const migration=fs.readFileSync("supabase/migrations/20261025121500_ifood_ack_recovery_leases.sql","utf8");
const recovery=fs.readFileSync("src/lib/ifood/order-sync-resilience.ts","utf8");
const worker=fs.readFileSync("scripts/ifood-ack-multiworker-homologation.cjs","utf8");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");

test("ACK claim lease is service-role only, 150s, bounded, invoker and tenant-scoped",()=>{
 assert.match(migration,/security invoker/i);
 assert.match(migration,/for update of e skip locked/i);
 assert.match(migration,/ack_lease_until = now\(\) \+ interval '150 seconds'/i);
 assert.match(migration,/from public, anon, authenticated/i);
 assert.match(migration,/to service_role/i);
 assert.match(migration,/e\.merchant_id = p_merchant_id/i);
 assert.match(migration,/i\.order_sync_enabled = true/i);
 assert.match(migration,/limit least\(greatest\(coalesce\(p_batch_size, 1\), 1\), 100\)/i);
});
test("feature-flagged ACK path fences completion without falling back to unsafe select",()=>{
 assert.match(recovery,/if \(isIfoodReplayEnabled\(\)\)/);
 assert.match(recovery,/claim_ifood_pending_acks/);
 assert.match(recovery,/\.eq\("ack_lease_token", token\)/);
 assert.match(recovery,/\.gt\("ack_lease_until"/);
 assert.match(recovery,/acknowledgeIfoodOrderEvents\(ids\)/);
 assert.match(recovery,/if \(claimError\) throw/);
 assert.match(recovery,/MAX_ACK_BATCHES_PER_RUN = 5/);
});
test("CI runs real independent Node workers only with local Supabase, no real API",()=>{
 assert.match(worker,/IFOOD_ACK_MULTIWORKER_E2E/);
 assert.match(worker,/REMOTE DATABASE FORBIDDEN/);
 assert.match(worker,/spawn\(process\.execPath/);
 assert.match(worker,/competingWorkersWithoutProviderDuplicates/);
 assert.match(worker,/CHILD_CRASH_CODE = 83/);
 assert.match(worker,/Stale worker cannot complete other worker's ACK/);
 assert.match(ci,/IFOOD_ACK_MULTIWORKER_E2E: "1"/);
 assert.match(ci,/node scripts\/ifood-ack-multiworker-homologation\.cjs/);
});
