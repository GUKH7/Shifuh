"use strict";

// ACK ambiguity and out-of-order status E2E. ALL data lives in disposable local Supabase.
// Real iFood and WhatsApp endpoints are never accessed.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const RESTAURANT="11111111-1111-4111-8111-111111111111";

function localDb() {
  assert.equal(process.env.IFOOD_ACK_STATUS_E2E, "1", "Isolated test opt-in required");
  assert.equal(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "true", "Replay must be enabled only locally");
  const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname), "Refusing remote Supabase");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
}
function checked(r,label) {
  if(r.error) throw new Error(label+": "+r.error.message);
  return r.data;
}
function loadTs(relative,mocks) {
  const filename=path.resolve(__dirname,"..",relative);
  const output=ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const previous=Module._load;
  Module._load=function(request,parent,isMain){
    if(Object.hasOwn(mocks,request)) return mocks[request];
    if (request === "@/lib/ifood/legacy-ack-lease") {
      return loadTs("src/lib/ifood/legacy-ack-lease.ts", {});
    }
    return previous.call(this,request,parent,isMain);
  };
  try {
    const m=new Module(filename,module);
    m.filename=filename;
    m.paths=Module._nodeModulePaths(path.dirname(filename));
    m._compile(output,filename);
    return m.exports;
  } finally { Module._load=previous; }
}
function details(orderId){
  return {
    id:orderId,displayId:"TEST-ACK-STATUS",isTest:true,orderType:"DELIVERY",
    customer:{name:"Cliente Sintetico",phone:{number:"11999999999"}},
    delivery:{deliveryAddress:{streetName:"Rua Simulada",streetNumber:"1",city:"Suzano",state:"SP"}},
    items:[{name:"Produto ficticio",quantity:1,unitPrice:25}],
    total:{subTotal:25,deliveryFee:0,orderAmount:25,benefits:0},
    payments:{methods:[{method:"CREDIT",type:"ONLINE"}]},
  };
}
function failedWriteChain(table,payload,commitFirst,db) {
  const filters=[];
  return {
    eq(field,value){filters.push(["eq",field,value]);return this;},
    in(field,values){filters.push(["in",field,values]);return this;},
    gt(field,value){filters.push(["gt",field,value]);return this;},
    is(field,value){filters.push(["is",field,value]);return this;},
    select(){return this;},
    then(resolve,reject) {
      const result=Promise.resolve().then(async()=>{
        if(commitFirst){
          let query=db.from(table).update(payload);
          for(const [operation,field,value] of filters) query=query[operation](field,value);
          checked(await query,"Synthetic write committed before lost response");
        }
        return {data:null,error:{message:commitFirst
          ?"Synthetic database response lost AFTER COMMIT"
          :"Synthetic database update rejected BEFORE COMMIT"}};
      });
      return result.then(resolve,reject);
    },
  };
}
async function main(){
  const admin=localDb();
  const merchant="ack-status-ci-"+randomUUID();
  const prefix="ack-status-"+randomUUID();
  const eventIds=[];
  const orderIds=[];
  const accepted=new Set();
  const attempts=[];
  const injected={dbNoCommit:0,dbResponseLost:0,networkAfterAcceptance:0};

  class IfoodApiError extends Error {
    constructor(status,retryAfterMs){super("Synthetic iFood "+status);this.status=status;this.retryAfterMs=retryAfterMs;}
  }
  const provider={
    IfoodApiError,
    getIfoodOrderDetails:async orderId=>details(orderId),
    pollIfoodOrderEvents:async()=>[],
    mapIfoodEventCodeToStatus:code=>({
      PLC:"pending",CFM:"preparing",DSP:"delivering",FUL:"done",CAN:"canceled",
    })[code]||null,
    acknowledgeIfoodOrderEvents:async ids=>{
      attempts.push([...ids]);
      for(const id of ids) accepted.add(id); // iFood mock accepts before the response.
      if(injected.networkAfterAcceptance>0){
        injected.networkAfterAcceptance-=1;
        throw new IfoodApiError(504,120000); // Response lost AFTER acceptance.
      }
    },
  };
  const wrappedDb={
    rpc:(...args)=>admin.rpc(...args),
    from:table=>{
      if(table!=="ifood_order_events") return admin.from(table);
      const raw=admin.from(table);
      return new Proxy(raw,{get(target,property){
        if(property==="update") return payload=>{
          if(payload && payload.acknowledged_at && injected.dbNoCommit>0){
            injected.dbNoCommit-=1;
            return failedWriteChain(table,payload,false,admin);
          }
          if(payload && payload.acknowledged_at && injected.dbResponseLost>0){
            injected.dbResponseLost-=1;
            return failedWriteChain(table,payload,true,admin);
          }
          return target.update(payload);
        };
        const value=target[property];
        return typeof value==="function"?value.bind(target):value;
      }});
    },
  };
  const base={
    "@/lib/supabase/server":{createAdminClient:()=>wrappedDb},
    "@/lib/ifood/orders":provider,
    "@sentry/nextjs":{captureMessage(){}},
  };
  const orderSync=loadTs("src/lib/ifood/order-sync.ts",base);
  const replay=loadTs("src/lib/ifood/event-replay.ts",{
    ...base,"@/lib/ifood/order-sync":orderSync,
  });
  const resilience=loadTs("src/lib/ifood/order-sync-resilience.ts",{
    ...base,"@/lib/ifood/event-replay":replay,
    "@/lib/ifood/order-sync":{
      syncIfoodOrdersForRestaurant:async()=>({
        eventsReceived:0,eventsProcessed:0,eventsAcknowledged:0,duplicateEvents:0,
        pendingEvents:0,failedEventIds:[],upstreamRetryAfterMs:0,touchedOrders:[],
      }),
    },
  });
  async function orderRow(oid) {
    const data=checked(await admin.from("orders")
      .select("id,status,is_test,external_payload,cancellation_reason")
      .eq("restaurant_id",RESTAURANT).eq("external_order_id",oid),"Read status order");
    assert.equal(data.length,1,"One local order per external ID");
    return data[0];
  }
  async function saveOrder(oid,code,createdAt,metadata){
    const evt={id:prefix+"-"+randomUUID(),orderId:oid,merchantId:merchant,
      code,createdAt,metadata:metadata||{}};
    const result=await orderSync.upsertLocalOrderFromIfood(admin,RESTAURANT,evt);
    assert.ok(result.localOrderId);
    return result.localOrderId;
  }
  async function addAckCase(name){
    const oid=prefix+"-order-"+name;
    orderIds.push(oid);
    const localOrderId=await saveOrder(oid,"PLC","2026-10-25T11:00:00Z");
    const id=prefix+"-event-"+name;
    const row=checked(await admin.from("ifood_order_events").insert({
      restaurant_id:RESTAURANT,merchant_id:merchant,
      ifood_event_id:id,ifood_order_id:oid,event_code:"PLC",
      processed_at:new Date().toISOString(),local_order_id:localOrderId,
      raw_payload:{id,orderId:oid,merchantId:merchant,code:"PLC"},
    }).select("id").single(),"Insert synthetic acknowledged-pending event");
    eventIds.push(row.id);
    return {id,oid,localOrderId};
  }
  async function ackRow(id) {
    return checked(await admin.from("ifood_order_events")
      .select("processed_at,acknowledged_at,retry_count,local_order_id")
      .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",id).single(),"Read synthetic event");
  }
  const params={restaurantId:RESTAURANT,merchantId:merchant,source:"cron",maxAttempts:1};
  async function expireAck(ifoodEventId){
    checked(await admin.from("ifood_order_events")
      .update({ack_lease_until:new Date(Date.now()-1000).toISOString()})
      .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",ifoodEventId),
      "Advance isolated ACK lease only");
  }
  async function recover(){
    return resilience.syncIfoodOrdersWithResilience(params);
  }
  try {
    checked(await admin.from("ifood_integrations").upsert({
      restaurant_id:RESTAURANT,merchant_id:merchant,order_sync_enabled:true,status:"connected",
    },{onConflict:"restaurant_id"}),"Seed local merchant");

    // Case A: provider confirms receipt, DB never committed acknowledged_at.
    const a=await addAckCase("db-failed");
    injected.dbNoCommit=2; // Two separate lease windows with failed DB commits.
    const firstDbFailure=await recover();
    assert.equal(firstDbFailure.pendingAcknowledgementsRecovered,0);
    assert.equal((await ackRow(a.id)).acknowledged_at,null);
    assert.ok(accepted.has(a.id),"Provider mock must have accepted ACK before DB failure");
    assert.equal(checkAttempts(a.id),1,"First lease must prevent duplicate ACK");
    assert.equal((await ackRow(a.id)).retry_count,0);
    const heldDb=await recover();
    assert.equal(heldDb.pendingAcknowledgementsRecovered,0);
    assert.equal(checkAttempts(a.id),1,"ACK stays reserved after DB error");
    await expireAck(a.id);
    const secondDbFailure=await recover();
    assert.equal(secondDbFailure.pendingAcknowledgementsRecovered,0);
    assert.equal(checkAttempts(a.id),2);
    await expireAck(a.id);
    const aRecovered=await recover();
    assert.equal(aRecovered.pendingAcknowledgementsRecovered,1);
    assert.ok((await ackRow(a.id)).acknowledged_at);
    assert.equal(checkAttempts(a.id),3,"Retry after DB failure uses same event ID");
    assert.equal((await orderRow(a.oid)).id,a.localOrderId);
    await recover();
    assert.equal(checkAttempts(a.id),3,"Durably acknowledged ID cannot be resent");

    // Case B: ACK accepted and persisted, but SQL transport drops its response.
    // A new query should observe acknowledged_at and NEVER retry this ACK.
    const b=await addAckCase("db-response-lost");
    injected.dbResponseLost=1;
    await recover();
    assert.ok((await ackRow(b.id)).acknowledged_at,"DB ACK COMMIT is durable");
    assert.equal(checkAttempts(b.id),1,"No duplicate ACK if the DB commit succeeded");
    await recover();
    assert.equal(checkAttempts(b.id),1);

    // Case C: iFood accepted ACK but the HTTP response is lost (504).
    // At-least-once retransmission is required; mock is idempotent by event ID.
    const c=await addAckCase("provider-response-lost");
    injected.networkAfterAcceptance=2;
    const firstLostHttp=await recover();
    assert.equal(firstLostHttp.pendingAcknowledgementsRecovered,0);
    assert.ok(accepted.has(c.id),"Provider accepted ACK even though response was lost");
    assert.equal((await ackRow(c.id)).acknowledged_at,null);
    await recover();
    assert.equal(checkAttempts(c.id),1,"No concurrent resend during ambiguous HTTP lease");
    await expireAck(c.id);
    const secondLostHttp=await recover();
    assert.equal(secondLostHttp.pendingAcknowledgementsRecovered,0);
    assert.equal(checkAttempts(c.id),2);
    await expireAck(c.id);
    const cRecovered=await recover();
    assert.equal(cRecovered.pendingAcknowledgementsRecovered,1);
    assert.ok((await ackRow(c.id)).acknowledged_at);
    assert.equal(checkAttempts(c.id),3,"Retry same ID after ambiguous provider response");
    await recover();
    assert.equal(checkAttempts(c.id),3,"No ACK re-send after successful local persistence");

    // Case D: deliberately arrive in order CFM, then older PLC, followed
    // by DSP, then older CFM, and finally terminal DONE followed by CAN.
    const progress=prefix+"-status-progression";
    orderIds.push(progress);
    await saveOrder(progress,"CFM","2026-10-25T11:02:00Z");
    assert.equal((await orderRow(progress)).status,"preparing");
    await saveOrder(progress,"PLC","2026-10-25T11:00:00Z");
    let status=await orderRow(progress);
    assert.equal(status.status,"preparing","Older PLACED may not undo CONFIRMED");
    assert.equal(status.external_payload.gestorDelivery.ignoredStatusEvent.reason,
      "status_regression_prevented");
    await saveOrder(progress,"DSP","2026-10-25T11:04:00Z");
    assert.equal((await orderRow(progress)).status,"delivering");
    await saveOrder(progress,"CFM","2026-10-25T11:02:00Z");
    assert.equal((await orderRow(progress)).status,"delivering");
    await saveOrder(progress,"FUL","2026-10-25T11:06:00Z");
    assert.equal((await orderRow(progress)).status,"done");
    await saveOrder(progress,"CAN","2026-10-25T11:05:00Z",
      {reasonDescription:"Cancelamento atrasado ficticio"});
    status=await orderRow(progress);
    assert.equal(status.status,"done","DONE is a terminal state");
    assert.equal(status.cancellation_reason,null,"Late CAN must not add cancellation reason to DONE");
    assert.equal(status.external_payload.gestorDelivery.ignoredStatusEvent.reason,
      "terminal_status_protected");

    // Case E: terminal cancellation must remain canceled, and its reason
    // must survive older/non-terminal or conflicting later events.
    const canceled=prefix+"-status-canceled";
    orderIds.push(canceled);
    await saveOrder(canceled,"CAN","2026-10-25T11:08:00Z",
      {reasonDescription:"Cancelamento ficticio preservado"});
    status=await orderRow(canceled);
    assert.equal(status.status,"canceled");
    const cancellationReason=status.cancellation_reason;
    assert.ok(cancellationReason && cancellationReason.includes("Cancelamento ficticio"));
    await saveOrder(canceled,"PLC","2026-10-25T11:00:00Z");
    status=await orderRow(canceled);
    assert.equal(status.status,"canceled");
    assert.equal(status.cancellation_reason,cancellationReason,
      "Delayed PLACED must not erase terminal cancellation reason");
    await saveOrder(canceled,"FUL","2026-10-25T11:10:00Z");
    status=await orderRow(canceled);
    assert.equal(status.status,"canceled","DONE may not reopen a canceled order");
    assert.equal(status.cancellation_reason,cancellationReason,
      "Conflicting DONE must not erase cancellation reason");
    assert.equal(status.external_payload.gestorDelivery.ignoredStatusEvent.reason,
      "terminal_status_protected");

    assert.equal(accepted.size,3,"Only three unique synthetic provider event IDs");
    assert.equal(checkAttempts(a.id),3);
    assert.equal(checkAttempts(b.id),1);
    assert.equal(checkAttempts(c.id),3);
    const queue=await replay.inspectIfoodQueue(RESTAURANT);
    assert.deepEqual(queue,{pending:0,awaitingAcknowledgement:0,deadLettered:0});
    console.log("HOMOLOG ACK ambiguity and status",JSON.stringify({
      acceptedButDbNotRecorded:true,
      committedDbResponseLost:true,
      networkResponseLostAfterProviderAccepted:true,
      distinctAckIds:accepted.size,
      ackTransmissions:attempts.length,
      providerRetryIsIdempotentInMock:true,
      outOfOrderStatusTransitions:7,
      terminalOrderStatusesProtected:2,
      preservedCancellationReason:true,
      duplicateOrders:0,
      finalQueue:queue,
    }));
  } finally {
    if(eventIds.length) checked(await admin.from("ifood_order_events")
      .delete().in("id",eventIds),"Cleanup synthetic events");
    if(orderIds.length){
      const orderRows=checked(await admin.from("orders").select("id")
        .eq("restaurant_id",RESTAURANT).in("external_order_id",orderIds),
        "Find synthetic orders for cleanup");
      if(orderRows.length){
        checked(await admin.from("order_items")
          .delete().in("order_id",orderRows.map(x=>x.id)),"Cleanup synthetic items");
        checked(await admin.from("orders")
          .delete().in("id",orderRows.map(x=>x.id)),"Cleanup synthetic orders");
      }
    }
    checked(await admin.from("ifood_integrations").delete().eq("restaurant_id",RESTAURANT)
      .eq("merchant_id",merchant),"Cleanup local merchant");
  }
  function checkAttempts(id){
    return attempts.reduce((sum,ids)=>sum+ids.filter(x=>x===id).length,0);
  }
}
main().catch(error=>{console.error("Isolated ACK/status E2E failed",error);process.exitCode=1});
