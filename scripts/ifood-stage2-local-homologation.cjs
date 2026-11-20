"use strict";

// Etapa 2 da homologacao iFood: ONLY local Supabase + mocked iFood.
// Explicitly rejects credentials, real iFood hosts, remote Supabase and replay.
// No official test merchant or production data is used.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

function requireLocalSafety() {
  assert.equal(process.env.IFOOD_STAGE2_LOCAL_E2E, "1", "Opt-in IFOOD_STAGE2_LOCAL_E2E=1 required");
  assert.notEqual(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "true", "Replay must stay OFF");
  for (const key of ["IFOOD_CLIENT_ID", "IFOOD_CLIENT_SECRET", "IFOOD_AUTH_URL"]) {
    assert.ok(!process.env[key], key + " is forbidden in mocked local E2E");
  }
  if (process.env.IFOOD_MERCHANT_API_BASE_URL) {
    const upstream = new URL(process.env.IFOOD_MERCHANT_API_BASE_URL);
    assert.ok(["127.0.0.1", "localhost"].includes(upstream.hostname),
      "Refusing remote iFood endpoint");
  }
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Refusing remote Supabase");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "Local service role is required");
  return url;
}

function loadTs(relative, mocks) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(compiled, filename);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function check(response, action) {
  if (response.error) throw new Error(action + ": " + response.error.message);
  return response.data;
}

async function main() {
  const localUrl = requireLocalSafety();
  const admin = createClient(localUrl.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Existing disposable CI fixture; never a real restaurant or merchant.
  const restaurantId = "11111111-1111-4111-8111-111111111111";
  const merchantId = randomUUID();
  const orderId = "stage2-order-" + randomUUID();
  const eventId = "stage2-event-" + randomUUID();
  const events = [{ id:eventId, orderId, merchantId, code:"PLC", fullCode:"PLACED",
    createdAt:new Date().toISOString(), metadata:{group:"ORDER_STATUS"} }];
  const acks = [];
  let pollCalls = 0;
  let confirmCalls = 0;
  let insertedOrderId = null;
  let syncRunIds = [];

  const details = {
    id:orderId, displayId:"STAGE2-TEST", isTest:true, orderType:"DELIVERY",
    customer:{name:"Cliente Sintetico",phone:{number:"11999999999"}},
    delivery:{deliveryAddress:{streetName:"Rua Ficticia",streetNumber:"1",city:"Sao Paulo",state:"SP"}},
    items:[{name:"Item Ficticio",quantity:1,unitPrice:25}],
    total:{subTotal:25,deliveryFee:0,orderAmount:25,benefits:0},
    payments:{methods:[{method:"CREDIT",type:"ONLINE"}]},
  };
  const mockedIfood = {
    pollIfoodOrderEvents:async id=>{
      assert.equal(id,merchantId,"Polling must use synthetic merchant only");
      pollCalls++;
      return events;
    },
    getIfoodOrderDetails:async id=>{
      assert.equal(id,orderId);
      return details;
    },
    mapIfoodEventCodeToStatus:code=>code==="PLC"?"pending":null,
    acknowledgeIfoodOrderEvents:async ids=>{
      // Verify durable processing BEFORE the simulated provider ACK.
      const rows=check(await admin.from("ifood_order_events")
        .select("ifood_event_id,processed_at,merchant_id")
        .eq("restaurant_id",restaurantId).in("ifood_event_id",ids),"Inspect before ACK");
      assert.equal(rows.length,ids.length);
      assert.ok(rows.every(row=>row.processed_at && row.merchant_id===merchantId));
      acks.push(...ids);
    },
  };

  const legacy = loadTs("src/lib/ifood/legacy-ack-lease.ts", {});
  const sync = loadTs("src/lib/ifood/order-sync.ts", {
    "@/lib/supabase/server":{createAdminClient:()=>admin},
    "@/lib/ifood/orders":mockedIfood,
    "@/lib/ifood/legacy-ack-lease":legacy,
  });

  try {
    check(await admin.from("ifood_integrations").upsert({
      restaurant_id:restaurantId,merchant_id:merchantId,
      order_sync_enabled:false,status:"configuring",
    },{onConflict:"restaurant_id"}),"Seed synthetic integration");

    const first=await sync.syncIfoodOrdersForRestaurant({
      restaurantId,merchantId,source:"manual",
    });
    assert.equal(first.eventsReceived,1);
    assert.equal(first.eventsProcessed,1);
    assert.equal(first.eventsAcknowledged,1);
    assert.equal(first.pendingEvents,0);
    assert.deepEqual(acks,[eventId]);

    const storedEvents=check(await admin.from("ifood_order_events")
      .select("ifood_event_id,processed_at,acknowledged_at,local_order_id")
      .eq("restaurant_id",restaurantId).eq("ifood_event_id",eventId),"Read event");
    assert.equal(storedEvents.length,1);
    assert.ok(storedEvents[0].processed_at && storedEvents[0].acknowledged_at);
    insertedOrderId=storedEvents[0].local_order_id;

    const orders=check(await admin.from("orders").select("id,is_test,status")
      .eq("restaurant_id",restaurantId).eq("external_order_id",orderId),"Read test order");
    assert.equal(orders.length,1,"One local order expected");
    assert.equal(orders[0].is_test,true,"Must remain a test order");

    // Exercise the REAL order client method, but replace the provider HTTP
    // transport with an in-process mock; never contact the iFood API.
    const orderApi=loadTs("src/lib/ifood/orders.ts",{
      "@/lib/ifood/catalog":{getIfoodAccessToken:async()=>"fake-local-token"},
    });
    const previousFetch=global.fetch;
    global.fetch=async(url,init={})=>{
      assert.equal(url,"https://merchant-api.ifood.com.br/order/v1.0/orders/"+orderId+"/confirm");
      assert.equal(init.method,"POST");
      assert.equal(init.headers.Authorization,"Bearer fake-local-token");
      confirmCalls++;
      return new Response(null,{status:204});
    };
    try {
      await orderApi.confirmIfoodOrder(orderId);
    } finally {
      global.fetch=previousFetch;
    }
    assert.equal(confirmCalls,1,"Exactly one simulated order confirmation");

    const second=await sync.syncIfoodOrdersForRestaurant({
      restaurantId,merchantId,source:"manual",
    });
    assert.equal(second.eventsProcessed,0,"A processed event must not be duplicated");
    assert.equal(second.eventsAcknowledged,0,"An ACKed event must not be ACKed twice");
    assert.deepEqual(acks,[eventId]);
    const ordersAfter=check(await admin.from("orders").select("id")
      .eq("restaurant_id",restaurantId).eq("external_order_id",orderId),"Check order dedup");
    assert.equal(ordersAfter.length,1);
    assert.equal(pollCalls,2);
    console.log("PASS ifood stage2 local",JSON.stringify({
      received:1,processed:1,acknowledged:1,confirmedWithMock:1,
      duplicateOrders:0,duplicateAcks:0,pollCalls,provider:"mock",database:"localhost",
    }));
  } finally {
    // Cleanup ONLY synthetic records, even if the assertions failed.
    const runs=check(await admin.from("ifood_sync_runs").select("id")
      .eq("restaurant_id",restaurantId).eq("sync_type","orders_polling")
      .contains("payload",{merchantId}),"Find synthetic sync runs");
    syncRunIds=runs.map(row=>row.id);
    if (syncRunIds.length) check(await admin.from("ifood_sync_runs").delete()
      .in("id",syncRunIds),"Cleanup synthetic runs");
    check(await admin.from("ifood_order_events").delete()
      .eq("restaurant_id",restaurantId).eq("ifood_event_id",eventId),"Cleanup event");
    if (insertedOrderId) {
      check(await admin.from("order_items").delete().eq("order_id",insertedOrderId),"Cleanup items");
      check(await admin.from("orders").delete().eq("id",insertedOrderId)
        .eq("restaurant_id",restaurantId),"Cleanup order");
    }
    check(await admin.from("ifood_integrations").delete()
      .eq("restaurant_id",restaurantId).eq("merchant_id",merchantId),"Cleanup integration");
  }
}
main().catch(error=>{
  console.error("FAIL iFood stage2 local:",error.message);
  process.exitCode=1;
});
