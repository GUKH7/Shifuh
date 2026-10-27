"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");
const src=fs.readFileSync("scripts/ifood-worker-restart-homologation.cjs","utf8");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
test("crash/restart matrix only accepts opt-in local Supabase and mock iFood",()=>{
 assert.match(src,/IFOOD_REPLAY_RESTART_E2E/);
 assert.match(src,/REMOTE DATABASE FORBIDDEN/);
 assert.match(src,/getIfoodOrderDetails: async oid =>/);
 assert.match(src,/acknowledgeIfoodOrderEvents: async ids =>/);
 assert.match(ci,/IFOOD_REPLAY_RESTART_E2E: "1"/);
 assert.match(ci,/node scripts\/ifood-worker-restart-homologation\.cjs/);
});
test("real child exits isolate crash-after-commit and crash-before-ACK",()=>{
 assert.match(src,/process\.exit\(EXIT_AFTER_ORDER\)/);
 assert.match(src,/process\.exit\(EXIT_BEFORE_ACK\)/);
 assert.match(src,/processing_lease_until:new Date\(Date\.now\(\)-1000\)/);
 assert.match(src,/acked,\[event1\]/);
 assert.match(src,/Persisted ACK must not be re-sent/);
});
test("simultaneous distinct events for one order synchronize independent processes",()=>{
 assert.match(src,/race-a/);
 assert.match(src,/race-b/);
 assert.match(src,/waitForBarriers/);
 assert.match(src,/p_batch_size: 1/);
 assert.match(src,/Simultaneous event upserts may never create multiple local orders/);
 assert.match(src,/new Set\(afterRace\.map\(row=>row\.local_order_id\)\)\.size/);
});
