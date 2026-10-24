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
    acknowledgeIfoodOrderEvents: async ids => { recordedAckIds.push(...ids); },
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

    const result = await replay.replayStoredIfoodEvents(restaurantId,merchantId);
    assert.equal(result.claimed,4);
    assert.equal(result.processed,2);
    assert.equal(result.temporaryFailures,1);
    assert.equal(result.deadLetteredEvents,1);
    assert.equal(result.maxRetryAfterMs,120_000);
    assert.equal(result.lostLeases,0);

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

    // Simulate the acknowledgement transport after durable processing only.
    // Real iFood API must never be called in this suite.
    const processedIds=stored.filter(e=>e.processed_at).map(e=>e.ifood_event_id);
    await ifoodMock.acknowledgeIfoodOrderEvents(processedIds);
    assert.deepEqual(recordedAckIds.sort(),events.slice(0,2).map(e=>e.id).sort());
    check(await admin.from("ifood_order_events")
      .update({acknowledged_at:new Date().toISOString()})
      .eq("restaurant_id",restaurantId).in("ifood_event_id",recordedAckIds), "Persist mock ACK");
    const final=await replay.inspectIfoodQueue(restaurantId);
    assert.deepEqual(final, {pending:1,awaitingAcknowledgement:0,deadLettered:1});
    const finalOrders=check(await admin.from("orders").select("id")
      .eq("restaurant_id",restaurantId).eq("external_order_id",orderId),"Verify no duplicate");
    assert.equal(finalOrders.length,1);
    console.log("HOMOLOG replay",JSON.stringify({
      claimed:result.claimed,processed:result.processed,
      temporaryFailures:result.temporaryFailures,deadLettered:result.deadLetteredEvents,
      maxRetryAfterMs:result.maxRetryAfterMs,
      acked:recordedAckIds.length,duplicateOrders:finalOrders.length-1,
      finalQueue:final,
    }));
  } finally {
    if (insertedEventIds.length) check(await admin.from("ifood_order_events")
      .delete().in("id",insertedEventIds),"Cleanup synthetic events");
    const createdOrders=check(await admin.from("orders").select("id").eq("restaurant_id",restaurantId)
      .eq("external_order_id",orderId),"Cleanup order lookup");
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
