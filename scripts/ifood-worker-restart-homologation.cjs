"use strict";

// Persistent replay crash / restart suite. Runs against disposable Supabase only.
// Children are separate Node processes. iFood is *always* mocked.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const EXIT_AFTER_ORDER = 71;
const EXIT_BEFORE_ACK = 72;
const CHILD_TIMEOUT_MS = 20000;

function requireIsolatedDatabase() {
  assert.equal(process.env.IFOOD_REPLAY_RESTART_E2E, "1", "Explicit CI E2E opt-in required");
  assert.equal(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "true", "Replay must be enabled only in disposable CI");
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "REMOTE DATABASE FORBIDDEN");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "Missing isolated service key");
  return createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function check(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data;
}

function loadTs(relative, mocks) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true },
  }).outputText;
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return original.call(this, request, parent, isMain);
  };
  try {
    const m = new Module(filename, module);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(path.dirname(filename));
    m._compile(compiled, filename);
    return m.exports;
  } finally {
    Module._load = original;
  }
}

function orderDetails(orderId) {
  return {
    id: orderId, displayId: "TEST-RESTART", isTest: true, orderType: "DELIVERY",
    customer: { name: "Cliente Sintetico", phone: { number: "11999999999" } },
    delivery: { deliveryAddress: {
      streetName: "Rua Simulada", streetNumber: "1", city: "Suzano", state: "SP",
    }},
    items: [{ name: "Produto de teste", quantity: 1, unitPrice: 25 }],
    total: { subTotal: 25, deliveryFee: 0, orderAmount: 25, benefits: 0 },
    payments: { methods: [{ method: "CREDIT", type: "ONLINE" }] },
  };
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runChild() {
  const admin = requireIsolatedDatabase();
  const mode = process.env.IFOOD_RESTART_MODE;
  const merchant = process.env.IFOOD_RESTART_MERCHANT;
  const orderId = process.env.IFOOD_RESTART_ORDER;
  const barrierDir = process.env.IFOOD_RESTART_BARRIER_DIR;
  assert.ok(merchant && orderId && mode);
  let acked = [];
  class IfoodApiError extends Error {
    constructor(status, retryAfterMs) {
      super("Synthetic iFood " + status);
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  }
  const mocks = {
    IfoodApiError,
    getIfoodOrderDetails: async oid => {
      assert.equal(oid, orderId);
      if (mode.startsWith("race-")) {
        await fs.promises.writeFile(path.join(barrierDir, mode + ".ready"), "1");
        while (!fs.existsSync(path.join(barrierDir, "release"))) await delay(20);
      }
      return orderDetails(oid);
    },
    mapIfoodEventCodeToStatus: code => code === "CFM" ? "preparing" : "pending",
    acknowledgeIfoodOrderEvents: async ids => { acked.push(...ids); },
    pollIfoodOrderEvents: async () => [],
  };
  // Independent replay workers receive separate database connections. Claim
  // just one event each when racing so both can update the *same* order.
  const workerAdmin = {
    from: (...args) => admin.from(...args),
    rpc: (name, params) => admin.rpc(name, mode.startsWith("race-") &&
      name === "claim_ifood_pending_events" ? {...params, p_batch_size: 1} : params),
  };
  const baseMocks = {
    "@/lib/supabase/server": {createAdminClient: () => workerAdmin},
    "@/lib/ifood/orders": mocks,
    "@sentry/nextjs": {captureMessage() {}},
  };
  const sync = loadTs("src/lib/ifood/order-sync.ts", baseMocks);
  const replaySync = {
    ...sync,
    upsertLocalOrderFromIfood: async (...args) => {
      const saved = await sync.upsertLocalOrderFromIfood(...args);
      if (mode === "crash-after-order") {
        // Real order RPC committed, event mark and iFood ACK have not occurred.
        console.log("SIMULATED_CRASH_AFTER_ORDER_COMMIT");
        process.exit(EXIT_AFTER_ORDER);
      }
      return saved;
    },
  };
  const replay = loadTs("src/lib/ifood/event-replay.ts", {
    ...baseMocks, "@/lib/ifood/order-sync": replaySync,
  });
  if (mode === "restart-ack") {
    const resilient = loadTs("src/lib/ifood/order-sync-resilience.ts", {
      ...baseMocks,
      "@/lib/ifood/event-replay": replay,
      "@/lib/ifood/order-sync": {
        syncIfoodOrdersForRestaurant: async () => ({
          eventsReceived: 0, eventsProcessed: 0, eventsAcknowledged: 0,
          duplicateEvents: 0, pendingEvents: 0, failedEventIds: [],
          upstreamRetryAfterMs: 0, touchedOrders: [],
        }),
      },
    });
    const result = await resilient.syncIfoodOrdersWithResilience({
      restaurantId: RESTAURANT, merchantId: merchant, source: "cron", maxAttempts: 1,
    });
    console.log("RESTART_ACK_RESULT " + JSON.stringify({
      recovered: result.pendingAcknowledgementsRecovered, acked,
      queueHealth: result.queueHealth,
    }));
    return;
  }

  const result = await replay.replayStoredIfoodEvents(RESTAURANT, merchant);
  if (mode === "crash-before-ack") {
    assert.equal(result.processed, 1);
    console.log("SIMULATED_CRASH_BEFORE_ACK");
    process.exit(EXIT_BEFORE_ACK);
  }
  console.log("RESTART_REPLAY_RESULT " + JSON.stringify({mode, ...result}));
}

function launch(mode, vars) {
  const child = spawn(process.execPath, [__filename, "--child"], {
    cwd: path.resolve(__dirname, ".."),
    env: {...process.env, ...vars, IFOOD_RESTART_MODE: mode},
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({code, signal, stdout, stderr}));
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), CHILD_TIMEOUT_MS);
  return {child,done:done.finally(() => clearTimeout(timeout)),
    output:()=>({stdout,stderr})};
}

async function runExpected(mode, env, expectedCode) {
  const proc = launch(mode, env);
  const result = await proc.done;
  assert.equal(result.code, expectedCode,
    mode + " exited unexpectedly: " + JSON.stringify(result));
  assert.equal(result.signal, null);
  return result.stdout;
}

async function waitForBarriers(dir, workers) {
  const end=Date.now()+12000;
  while (Date.now()<end) {
    if (workers.some(w => w.child.exitCode !== null)) {
      throw new Error("Worker exited before race barrier: " +
        JSON.stringify(workers.map(w=>w.output())));
    }
    if (["race-a","race-b"].every(mode=>fs.existsSync(path.join(dir,mode+".ready")))) return;
    await delay(25);
  }
  throw new Error("Workers failed to reach simultaneous order creation barrier: " +
    JSON.stringify(workers.map(w=>w.output())));
}

async function parent() {
  const admin = requireIsolatedDatabase();
  const merchantId = "restart-ci-" + randomUUID();
  const order1 = "restart-order-" + randomUUID();
  const order2 = "race-order-" + randomUUID();
  const event1 = "crash-event-" + randomUUID();
  const event2 = "race-placed-" + randomUUID();
  const event3 = "race-confirmed-" + randomUUID();
  const eventIds = [event1,event2,event3];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),"shifuh-ifood-restart-"));
  const env = {
    IFOOD_RESTART_MERCHANT: merchantId,
    IFOOD_RESTART_ORDER: order1,
    IFOOD_RESTART_BARRIER_DIR: tmp,
  };
  let addedIds = [];
  const getEvents=() => admin.from("ifood_order_events")
    .select("id,ifood_event_id,processed_at,acknowledged_at,processing_lease_token,retry_count,local_order_id")
    .eq("restaurant_id", RESTAURANT)
    .in("ifood_event_id",eventIds);
  const orders = id => admin.from("orders").select("id,external_order_id,is_test")
    .eq("restaurant_id",RESTAURANT).eq("external_order_id",id);
  try {
    check(await admin.from("ifood_integrations").upsert({
      restaurant_id: RESTAURANT,merchant_id:merchantId,
      order_sync_enabled:true,status:"connected",
    },{onConflict:"restaurant_id"}),"Create isolated integration");
    const seeded=check(await admin.from("ifood_order_events").insert({
      restaurant_id:RESTAURANT,merchant_id:merchantId,
      ifood_event_id:event1,ifood_order_id:order1,event_code:"PLC",
      raw_payload:{id:event1,orderId:order1,merchantId,code:"PLC"},
    }).select("id"),"Seed crash scenario");
    addedIds.push(...seeded.map(r=>r.id));

    // Step 1. Kill an actual Node process immediately after the order RPC commits.
    const crashed = await runExpected("crash-after-order",env,EXIT_AFTER_ORDER);
    assert.match(crashed,/SIMULATED_CRASH_AFTER_ORDER_COMMIT/);
    assert.doesNotMatch(crashed,/ACK_IDS/);
    const saved1=check(await orders(order1),"Order committed before crash");
    assert.equal(saved1.length,1);
    assert.equal(saved1[0].is_test,true);
    const beforeRestart=check(await getEvents(),"Read event after crash")
      .find(row=>row.ifood_event_id===event1);
    assert.equal(beforeRestart.processed_at,null,"Order committed but event not marked");
    assert.equal(beforeRestart.acknowledged_at,null,"No ACK during crash");
    assert.ok(beforeRestart.processing_lease_token,"Crashed worker left lease");

    // Fast-forward the *synthetic* lease; simulate timeout without sleeping.
    check(await admin.from("ifood_order_events").update({
      processing_lease_until:new Date(Date.now()-1000).toISOString(),
    }).eq("id",beforeRestart.id),"Expire synthetic lease");

    // Step 2. Fresh process sees existing order, completes event, then dies
    // before running the separate ACK recovery.
    const crash2=await runExpected("crash-before-ack",env,EXIT_BEFORE_ACK);
    assert.match(crash2,/SIMULATED_CRASH_BEFORE_ACK/);
    const afterMark=check(await getEvents(),"Read after second crash")
      .find(row=>row.ifood_event_id===event1);
    assert.ok(afterMark.processed_at);
    assert.equal(afterMark.acknowledged_at,null);
    assert.equal(afterMark.local_order_id,saved1[0].id);
    assert.equal(check(await orders(order1),"Order after second crash").length,1);

    // Step 3. Another entirely new process performs ACK recovery even with
    // zero polling events. No reprocessing, no duplicate orders.
    const restored=await runExpected("restart-ack",env,0);
    const ackResult=JSON.parse(restored.split("\n").find(s=>s.startsWith("RESTART_ACK_RESULT ")).slice("RESTART_ACK_RESULT ".length));
    assert.equal(ackResult.recovered,1);
    assert.deepEqual(ackResult.acked,[event1]);
    const afterAck=check(await getEvents(),"Read ACK after restart")
      .find(row=>row.ifood_event_id===event1);
    assert.ok(afterAck.acknowledged_at);
    const ackAgain=await runExpected("restart-ack",env,0);
    const ackAgainResult=JSON.parse(ackAgain.split("\n").find(s=>s.startsWith("RESTART_ACK_RESULT ")).slice("RESTART_ACK_RESULT ".length));
    assert.equal(ackAgainResult.recovered,0);
    assert.deepEqual(ackAgainResult.acked,[],"Persisted ACK must not be re-sent");

    // Step 4. Separate Node processes each claim a different event with the
    // SAME order ID, then proceed simultaneously through the real order RPC.
    const concurrent=check(await admin.from("ifood_order_events").insert([
      {restaurant_id:RESTAURANT,merchant_id:merchantId,ifood_event_id:event2,
        ifood_order_id:order2,event_code:"PLC",
        raw_payload:{id:event2,orderId:order2,merchantId,code:"PLC"}},
      {restaurant_id:RESTAURANT,merchant_id:merchantId,ifood_event_id:event3,
        ifood_order_id:order2,event_code:"CFM",
        raw_payload:{id:event3,orderId:order2,merchantId,code:"CFM"}},
    ]).select("id"),"Seed concurrent same-order events");
    addedIds.push(...concurrent.map(x=>x.id));
    const raceEnv={...env,IFOOD_RESTART_ORDER:order2};
    const procs=[launch("race-a",raceEnv),launch("race-b",raceEnv)];
    try {
      await waitForBarriers(tmp,procs);
      fs.writeFileSync(path.join(tmp,"release"),"1");
      const finished=await Promise.all(procs.map(p=>p.done));
      for(const f of finished) assert.equal(f.code,0,"Worker race failed: "+JSON.stringify(f));
      const summaries=finished.map(f=>JSON.parse(f.stdout.split("\n")
        .find(s=>s.startsWith("RESTART_REPLAY_RESULT ")).slice("RESTART_REPLAY_RESULT ".length)));
      assert.equal(summaries.reduce((sum,s)=>sum+s.claimed,0),2,"Workers must claim distinct events");
      assert.equal(check(await orders(order2),"Orders after race").length,1,
        "Simultaneous event upserts may never create multiple local orders");

      // A uniqueness loser may have received a scheduled retry. Allow it to
      // recover later, but never count a transient race as a duplicate order.
      const pending=check(await getEvents(),"Inspect concurrent events")
        .filter(row=>[event2,event3].includes(row.ifood_event_id) && !row.processed_at);
      if(pending.length) {
        check(await admin.from("ifood_order_events")
          .update({next_retry_at:new Date(Date.now()-1000).toISOString()})
          .in("id",pending.map(row=>row.id)),"Advance synthetic retry");
      }
      const recoveredRace=await runExpected("replay",raceEnv,0);
      assert.match(recoveredRace,/RESTART_REPLAY_RESULT/);
      const afterRace=check(await getEvents(),"Inspect recovered concurrent events")
        .filter(row=>[event2,event3].includes(row.ifood_event_id));
      assert.equal(afterRace.length,2);
      assert.ok(afterRace.every(row=>row.processed_at));
      assert.equal(new Set(afterRace.map(row=>row.local_order_id)).size,1);
      assert.equal(check(await orders(order2),"Unique race order").length,1);
      const raceAck=await runExpected("restart-ack",raceEnv,0);
      const raceAckSummary=JSON.parse(raceAck.split("\n").find(s=>s.startsWith("RESTART_ACK_RESULT ")).slice("RESTART_ACK_RESULT ".length));
      assert.equal(raceAckSummary.recovered,2);
      assert.deepEqual(new Set(raceAckSummary.acked),new Set([event2,event3]));
      const final=check(await getEvents(),"Final persisted event state");
      assert.equal(final.length,3);
      assert.ok(final.every(row=>row.processed_at && row.acknowledged_at));
      assert.equal(check(await orders(order1),"Unique crash order").length,1);
      assert.equal(check(await orders(order2),"Unique race order").length,1);
      console.log("HOMOLOG crash/restart",JSON.stringify({
        simulatedProcessCrashes:2, independentWorkerRestarts:4,
        sameOrderConcurrentProcesses:2, sameOrderClaims:2,
        crashAfterCommitNoAck:true, crashAfterPersistBeforeAck:true,
        recoveredAckOnFreshProcess:1, duplicateOrders:0,
        raceEventsProcessed:afterRace.length, raceAcks:raceAckSummary.acked.length,
        totalPersistedAcks:final.length,
      }));
    } finally {
      fs.writeFileSync(path.join(tmp,"release"),"1");
      for(const p of procs) if(p.child.exitCode===null) p.child.kill("SIGKILL");
      await Promise.allSettled(procs.map(p=>p.done));
    }
  } finally {
    if (addedIds.length) check(await admin.from("ifood_order_events")
      .delete().in("id",addedIds),"Cleanup synthetic events");
    const createdOrders=check(await admin.from("orders").select("id")
      .eq("restaurant_id",RESTAURANT).in("external_order_id",[order1,order2]),
      "Cleanup synthetic orders lookup");
    if (createdOrders.length) {
      check(await admin.from("order_items").delete().in("order_id",createdOrders.map(r=>r.id)),
        "Cleanup synthetic order items");
      check(await admin.from("orders").delete().in("id",createdOrders.map(r=>r.id)),
        "Cleanup synthetic orders");
    }
    check(await admin.from("ifood_integrations").delete()
      .eq("restaurant_id",RESTAURANT).eq("merchant_id",merchantId),
      "Cleanup synthetic integration");
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}

if (process.argv.includes("--child")) {
  runChild().catch(error=>{console.error("Isolated child failure",error);process.exitCode=1});
} else {
  parent().catch(error=>{console.error("Isolated crash/restart validation failed",error);process.exitCode=1});
}
