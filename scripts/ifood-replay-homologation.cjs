"use strict";

// Synthetic, disposable integration test. Deliberately refuses remote or production Supabase.
// iFood HTTP calls are mocked; Postgres and its lease RPC are real.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

async function main() {
  assert.equal(process.env.IFOOD_REPLAY_HOMOLOGATION, "1", "Explicit opt-in required");
  assert.equal(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "true", "Replay flag must be on for the isolated run");
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Refusing nonlocal database");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "Isolated service role required");
  const admin = createClient(url.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const restaurantId = "11111111-1111-4111-8111-111111111111"; // CI fixture only
  const merchantId = "replay-homolog-" + randomUUID();
  const orderId = "order-homolog-" + randomUUID();
  const prefix = "ifood-homolog-" + randomUUID();
  const events = [
    { id: prefix + "-placed", orderId, code: "PLC", behavior: "ok", retry_count: 0 },
    { id: prefix + "-confirmed", orderId, code: "CFM", behavior: "ok", retry_count: 0 },
    { id: prefix + "-temporary", orderId: prefix + "-tmp", code: "PLC", behavior: "temporary", retry_count: 0 },
    { id: prefix + "-permanent", orderId: prefix + "-bad", code: "PLC", behavior: "permanent", retry_count: 5 },
  ];
  const recordedAckIds = [];
  const ackBatches = [];
  let ackFailuresRemaining = 0;

  class IfoodApiError extends Error {
    constructor(status, retryAfterMs) {
      super("Synthetic iFood HTTP " + status);
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  }
  function orderDetails(oid) {
    const kind = events.find(e => e.orderId === oid)?.behavior;
    if (kind === "temporary") throw new IfoodApiError(504, 120_000);
    if (kind === "permanent") throw new Error("Synthetic invalid order details");
    return {
      id: oid, displayId: "HOMOLOG-1", isTest: true,
      orderType: "DELIVERY", customer: { name: "Cliente Teste iFood", phone: {number: "11999999999"} },
      delivery: {deliveryAddress: {streetName:"Rua Teste",streetNumber:"1",city:"Sao Paulo",state:"SP"}},
      items: [{name:"Produto Sintetico",quantity:1,unitPrice:25}],
      total: {subTotal:25,deliveryFee:0,orderAmount:25,benefits:0},
      payments: {methods:[{method:"CREDIT",type:"ONLINE"}]},
    };
  }
  const ifoodMock = {
    IfoodApiError,
    getIfoodOrderDetails: async oid => orderDetails(oid),
    mapIfoodEventCodeToStatus: code => code === "CFM" ? "preparing" : "pending",
    acknowledgeIfoodOrderEvents: async ids => {
      ackBatches.push([...ids]);
      if (ackFailuresRemaining > 0) {
        ackFailuresRemaining -= 1;
        throw new IfoodApiError(504, 120_000);
      }
      recordedAckIds.push(...ids);
    },
    pollIfoodOrderEvents: async () => [],
  };

  function loadTs(relativePath, moduleMocks) {
    const filename = path.resolve(__dirname, "..", relativePath);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (Object.hasOwn(moduleMocks, request)) return moduleMocks[request];
    if (request === "@/lib/ifood/legacy-ack-lease") {
      return loadTs("src/lib/ifood/legacy-ack-lease.ts", {});
    }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const output = new Module(filename, module);
      output.filename = filename;
      output.paths = Module._nodeModulePaths(path.dirname(filename));
      output._compile(compiled, filename);
      return output.exports;
    } finally {
      Module._load = originalLoad;
    }
  }

  const baseMocks = {
    "@/lib/supabase/server": {createAdminClient: () => admin},
    "@/lib/ifood/orders": ifoodMock,
    "@sentry/nextjs": {captureMessage() {}},
  };
  const sync = loadTs("src/lib/ifood/order-sync.ts", baseMocks);
  const replay = loadTs("src/lib/ifood/event-replay.ts", {
    ...baseMocks, "@/lib/ifood/order-sync": sync,
  });
  assert.equal(replay.isIfoodReplayEnabled(), true);
  const resilience = loadTs("src/lib/ifood/order-sync-resilience.ts", {
    ...baseMocks,
    "@/lib/ifood/event-replay": replay,
    "@/lib/ifood/order-sync": {
      // The mocked polling response contains no events. The real resilience
      // routine must still recover stored ACKs when polling is empty.
      syncIfoodOrdersForRestaurant: async () => ({
        eventsReceived: 0, eventsProcessed: 0, eventsAcknowledged: 0,
        duplicateEvents: 0, pendingEvents: 0, failedEventIds: [],
        upstreamRetryAfterMs: 0, touchedOrders: [],
      }),
    },
  });

  function check(result, context) {
    if (result.error) throw new Error(context + ": " + result.error.message);
    return result.data;
  }
  const insertedEventIds = [];
  try {
    check(await admin.from("ifood_integrations").upsert({
      restaurant_id: restaurantId, merchant_id: merchantId,
      order_sync_enabled:true, status:"connected",
    }, {onConflict:"restaurant_id"}), "Create isolated integration");

    const rows = events.map(e=>({
      restaurant_id:restaurantId, merchant_id:merchantId,
      ifood_event_id:e.id, ifood_order_id:e.orderId,
      event_code:e.code, retry_count:e.retry_count,
      raw_payload:{id:e.id,orderId:e.orderId,merchantId,code:e.code},
    }));
    const created=check(await admin.from("ifood_order_events")
      .insert(rows).select("id, ifood_event_id"), "Insert test events");
    insertedEventIds.push(...created.map(x=>x.id));
    assert.equal(created.length,4);

    const initial = await replay.inspectIfoodQueue(restaurantId);
    assert.equal(initial.pending,4);
    assert.equal(initial.awaitingAcknowledgement,0);
    assert.equal(initial.deadLettered,0);
    console.log("HOMOLOG initial", JSON.stringify(initial));

    // Exercise two independent replay invocations racing for the same queue.
    // The atomic lease RPC must reserve every event only once.
    const simultaneous = await Promise.all([
      replay.replayStoredIfoodEvents(restaurantId, merchantId),
      replay.replayStoredIfoodEvents(restaurantId, merchantId),
    ]);
    const result = simultaneous.reduce((aggregate, run) => {
      for (const field of ["claimed","processed","temporaryFailures","retryEventsScheduled",
        "deadLetteredEvents","lostLeases"]) aggregate[field] += run[field];
      aggregate.maxRetryAfterMs = Math.max(aggregate.maxRetryAfterMs, run.maxRetryAfterMs);
      return aggregate;
    }, {claimed:0,processed:0,temporaryFailures:0,retryEventsScheduled:0,
        deadLetteredEvents:0,lostLeases:0,maxRetryAfterMs:0});
    assert.equal(result.claimed,4, "Two workers must never claim an event twice");
    // Competing events of the same order can race to create the same
    // external_order_id. The DB unique constraint protects the order;
    // the losing event is legitimately scheduled for a retry.
    assert.equal(result.processed+result.retryEventsScheduled,2,
      "Same-order events must complete or remain durably retryable");
    assert.equal(result.temporaryFailures,1);
    assert.equal(result.deadLetteredEvents,1);
    assert.equal(result.maxRetryAfterMs,120_000);
    assert.equal(result.lostLeases,0);

    let recoveredRaceEvents = 0;
    if(result.retryEventsScheduled>0){
      const dueRace=check(await admin.from("ifood_order_events")
        .select("id,ifood_event_id,retry_count,dead_lettered_at")
        .eq("restaurant_id",restaurantId).in("ifood_event_id",events.slice(0,2).map(e=>e.id))
        .is("processed_at",null),"Inspect same-order race");
      assert.equal(dueRace.length,result.retryEventsScheduled);
      for(const row of dueRace){
        assert.equal(row.retry_count,1,"Only the collision event uses one real retry");
        assert.equal(row.dead_lettered_at,null,"Collision must not be dead-lettered");
      }
      check(await admin.from("ifood_order_events")
        .update({next_retry_at:new Date(Date.now()-1000).toISOString()})
        .in("id",dueRace.map(row=>row.id)),"Advance synthetic collision cooldown");
      const raceRecovered=await replay.replayStoredIfoodEvents(restaurantId,merchantId);
      assert.equal(raceRecovered.claimed,dueRace.length);
      assert.equal(raceRecovered.processed,dueRace.length,
        "Retry must reuse already committed order and complete event");
      assert.equal(raceRecovered.deadLetteredEvents,0);
      recoveredRaceEvents=raceRecovered.processed;
    }
    assert.equal(result.processed+recoveredRaceEvents,2);

    const stored=check(await admin.from("ifood_order_events").select(
      "ifood_event_id,processed_at,acknowledged_at,retry_count,next_retry_at,dead_lettered_at,local_order_id"
    ).eq("restaurant_id",restaurantId).in("ifood_event_id",events.map(e=>e.id)), "Read replay state");
    const byId = new Map(stored.map(e=>[e.ifood_event_id,e]));
    for(const event of events.slice(0,2)) {
      assert.ok(byId.get(event.id).processed_at, "Processed event persisted");
      assert.equal(byId.get(event.id).acknowledged_at,null, "ACK remains pending until confirmed");
      assert.ok(byId.get(event.id).local_order_id);
    }
    assert.equal(byId.get(events[2].id).retry_count,0);
    assert.ok(new Date(byId.get(events[2].id).next_retry_at).getTime()>Date.now());
    assert.equal(byId.get(events[2].id).processed_at,null);
    assert.ok(byId.get(events[3].id).dead_lettered_at);
    assert.equal(byId.get(events[3].id).retry_count,6);

    const orders=check(await admin.from("orders").select("id,external_order_id,is_test")
      .eq("restaurant_id",restaurantId).eq("external_order_id",orderId), "Read synthetic orders");
    assert.equal(orders.length,1, "Multiple events for one iFood order must not duplicate orders");
    assert.equal(orders[0].is_test,true);
    assert.equal(stored[0].acknowledged_at,null);

    const noReprocess=await replay.replayStoredIfoodEvents(restaurantId,merchantId);
    assert.equal(noReprocess.claimed,0,"Processed, scheduled and dead-lettered events cannot be reclaimed");

    // Simulate eight 504s across virtual 120-second cooldown windows.
    // Fast-forward ONLY a synthetic event's next_retry_at in local Postgres;
    // do not wait in real time or access a real merchant.
    const offlineAttempts = 8;
    for (let attempt = 1; attempt < offlineAttempts; attempt += 1) {
      const blocked = await replay.replayStoredIfoodEvents(restaurantId, merchantId);
      assert.equal(blocked.claimed, 0, "Cooldown blocks immediate retries");
      check(await admin.from("ifood_order_events")
        .update({next_retry_at: new Date(Date.now() - 1000).toISOString()})
        .eq("restaurant_id",restaurantId).eq("ifood_event_id",events[2].id), "Advance virtual cooldown");
      const failed = await replay.replayStoredIfoodEvents(restaurantId, merchantId);
      assert.equal(failed.claimed, 1);
      assert.equal(failed.processed, 0);
      assert.equal(failed.temporaryFailures, 1);
      assert.equal(failed.deadLetteredEvents, 0);
      assert.equal(failed.retryEventsScheduled, 0);
      assert.equal(failed.maxRetryAfterMs, 120_000);
      const state = check(await admin.from("ifood_order_events")
        .select("processed_at,retry_count,dead_lettered_at,next_retry_at")
        .eq("restaurant_id",restaurantId).eq("ifood_event_id",events[2].id).single(),
        "Inspect repeated outage");
      assert.equal(state.processed_at,null);
      assert.equal(state.retry_count,0,"Long outages must never burn permanent retry budget");
      assert.equal(state.dead_lettered_at,null,"Long outages must never dead-letter recoverable events");
      assert.ok(new Date(state.next_retry_at).getTime() > Date.now() + 115_000,
        "Retry-After must be respected");
    }

    // Recover after the outage: the same event is retried from the database,
    // not repolled by iFood, and creates only one new local order.
    events[2].behavior = "ok";
    check(await admin.from("ifood_order_events")
      .update({next_retry_at: new Date(Date.now() - 1000).toISOString()})
      .eq("restaurant_id",restaurantId).eq("ifood_event_id",events[2].id),
      "Mark recovered upstream event due");
    const recovered = await replay.replayStoredIfoodEvents(restaurantId, merchantId);
    assert.equal(recovered.claimed,1);
    assert.equal(recovered.processed,1);
    assert.equal(recovered.deadLetteredEvents,0);
    const secondOrder = check(await admin.from("orders")
      .select("id,external_order_id,is_test").eq("restaurant_id",restaurantId)
      .eq("external_order_id",events[2].orderId), "Read recovered order");
    assert.equal(secondOrder.length,1);
    assert.equal(secondOrder[0].is_test,true);
    const afterRecovery=await replay.replayStoredIfoodEvents(restaurantId,merchantId);
    assert.equal(afterRecovery.claimed,0, "No replay of already recovered events");

    // Add 104 synthetic, already-processed events linked to an existing test order:
    // the resilient ACK path must send 100+7, never skip or duplicate an ID.
    const ackOnlyIds = Array.from({length:104},(_,i)=>prefix+"-ack-only-"+i);
    const ackOnly = ackOnlyIds.map(id=>({
      restaurant_id:restaurantId, merchant_id:merchantId,
      ifood_event_id:id, ifood_order_id:orderId, event_code:"PLC",
      processed_at:new Date().toISOString(),local_order_id:orders[0].id,
      raw_payload:{id,orderId,merchantId,code:"PLC"},
    }));
    const insertedAcks = check(await admin.from("ifood_order_events")
      .insert(ackOnly).select("id"), "Seed isolated ACK backlog");
    insertedEventIds.push(...insertedAcks.map(row=>row.id));

    const pendingAck = await replay.inspectIfoodQueue(restaurantId);
    assert.deepEqual(pendingAck, {pending:0,awaitingAcknowledgement:107,deadLettered:1});
    ackFailuresRemaining = 2; // Early recovery and post-poll recovery must both fail.
    const ackParams = {restaurantId,merchantId,source:"cron",maxAttempts:1};
    await assert.rejects(resilience.syncIfoodOrdersWithResilience(ackParams),
      error=>error instanceof IfoodApiError && error.status===504);
    assert.equal(ackBatches.length,2);
    assert.equal(recordedAckIds.length,0,"Failed transport cannot be marked ACKed");
    const afterAckOutage=await replay.inspectIfoodQueue(restaurantId);
    assert.equal(afterAckOutage.awaitingAcknowledgement,107);
    assert.equal(afterAckOutage.deadLettered,1);
    assert.equal(afterAckOutage.pending,0);

    // Both failed ACK batches must retain their leases. A fast-following
    // worker cannot resend the same IDs before timeout.
    const held=await resilience.syncIfoodOrdersWithResilience(ackParams);
    assert.equal(held.pendingAcknowledgementsRecovered,0);
    assert.equal(ackBatches.length,2,"Live lease blocks immediate duplicate ACK");
    check(await admin.from("ifood_order_events")
      .update({ack_lease_until:new Date(Date.now()-1000).toISOString()})
      .eq("restaurant_id",restaurantId)
      .is("acknowledged_at",null)
      .in("ifood_event_id",[...events.slice(0,3).map(e=>e.id),...ackOnlyIds]),
      "Expire only synthetic ACK leases after simulated crash");

    // The next healthy run recovers the same ACK backlog even with an empty
    // polling result, and concurrent calls share the single in-process run.
    const beforeSuccessfulAck = ackBatches.length;
    const [success,serialized] = await Promise.all([
      resilience.syncIfoodOrdersWithResilience(ackParams),
      resilience.syncIfoodOrdersWithResilience(ackParams),
    ]);
    assert.equal(success.pendingAcknowledgementsRecovered,107);
    assert.equal(serialized.serialized,true);
    assert.equal(ackBatches.length-beforeSuccessfulAck,2, "ACK backlog must be chunked at 100");
    assert.deepEqual(ackBatches.slice(beforeSuccessfulAck).map(batch=>batch.length),[100,7]);
    const uniqueAcknowledgements = new Set(recordedAckIds);
    assert.equal(uniqueAcknowledgements.size,107);
    assert.equal(recordedAckIds.length,107, "Each event is ACKed exactly once in the successful run");
    for(const id of [...events.slice(0,3).map(e=>e.id),...ackOnlyIds]) {
      assert.ok(uniqueAcknowledgements.has(id), "No committed event may lose its ACK");
    }
    const noDuplicateAck=await resilience.syncIfoodOrdersWithResilience(ackParams);
    assert.equal(noDuplicateAck.pendingAcknowledgementsRecovered,0);
    assert.equal(recordedAckIds.length,107,"Already ACKed IDs must not be resent");

    const final=await replay.inspectIfoodQueue(restaurantId);
    assert.deepEqual(final, {pending:0,awaitingAcknowledgement:0,deadLettered:1});
    const finalOrders=check(await admin.from("orders").select("id,external_order_id,is_test")
      .eq("restaurant_id",restaurantId)
      .in("external_order_id",[orderId,events[2].orderId]),"Verify unique local orders");
    assert.equal(finalOrders.length,2);
    assert.equal(finalOrders.filter(o=>o.external_order_id===orderId).length,1);
    assert.equal(finalOrders.filter(o=>o.external_order_id===events[2].orderId).length,1);
    console.log("HOMOLOG replay failure matrix",JSON.stringify({
      concurrentWorkers:2,
      initialClaims:result.claimed,
      upstream504Attempts:offlineAttempts,
      simulatedOutageMinutes:offlineAttempts*2,
      permanentRetryBudgetAfter504:0,
      recoveredEvents:recovered.processed,
      pendingAcksBeforeRecovery:pendingAck.awaitingAcknowledgement,
      ackTransportFailures:2,
      ackBatches:ackBatches.slice(beforeSuccessfulAck).map(batch=>batch.length),
      acked:recordedAckIds.length,
      duplicateOrders:0,
      finalQueue:final,
    }));
  } finally {
    if (insertedEventIds.length) check(await admin.from("ifood_order_events")
      .delete().in("id",insertedEventIds),"Cleanup synthetic events");
    const createdOrders=check(await admin.from("orders").select("id").eq("restaurant_id",restaurantId)
      .in("external_order_id",[orderId,events[2].orderId]),"Cleanup order lookup");
    if(createdOrders?.length) {
      check(await admin.from("order_items").delete().in("order_id",createdOrders.map(x=>x.id)),"Cleanup items");
      check(await admin.from("orders").delete().in("id",createdOrders.map(x=>x.id)),"Cleanup order");
    }
    check(await admin.from("ifood_integrations").delete()
      .eq("restaurant_id",restaurantId).eq("merchant_id",merchantId),"Cleanup integration");
  }
}
main().catch(err=>{
  console.error("Isolated iFood replay validation failed:",err.message);
  process.exitCode=1;
});
