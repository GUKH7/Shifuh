"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const filepath = path.join(__dirname, "..", "src/lib/ifood/event-replay.ts");
const event = {
  id: "record-1", ifood_event_id: "event-1", ifood_order_id: "order-1",
  merchant_id: "merchant-1", event_code: "PLC",
  raw_payload: {id: "spoofed-event", orderId: "spoofed-order", code: "CAN"},
  retry_count: 0, processing_lease_token: "lease-a",
};
const restaurantId = "11111111-1111-4111-8111-111111111111";
function loadReplay(state) {
  const original = Module._load;
  Module._load = function(request,parent,isMain) {
    if(request === "@sentry/nextjs") return {captureMessage() {}};
    if(request === "@/lib/ifood/orders") {
      return {IfoodApiError: class IfoodApiError extends Error {}};
    }
    if(request === "@/lib/ifood/order-sync") return {
      upsertLocalOrderFromIfood: async (_db,tenant,evt) => {
        assert.equal(tenant,restaurantId);
        assert.equal(evt.id,event.ifood_event_id);
        assert.equal(evt.orderId,event.ifood_order_id);
        assert.equal(evt.merchantId,event.merchant_id);
        state.upserts++;
        return {localOrderId:"local-order-1"};
      },
    };
    if(request === "@/lib/supabase/server") return {
      createAdminClient: () => ({
        rpc: async () => ({data:[event],error:null}),
        from: () => {
          const query = {
            operation: "read", data: null,
            update(data) {this.operation="update";this.data=data;return this;},
            select() {return this;},eq() {return this;},gt() {return this;},is() {return this;},
            async maybeSingle() {
              if(this.operation==="update"){
                state.updates.push(this.data);
                return state.updateResults.shift() || {data:null,error:null};
              }
              return state.readResults.shift() || {data:null,error:null};
            },
          };
          return query;
        },
      }),
    };
    return original.call(this,request,parent,isMain);
  };
  try {
    const compiled = ts.transpileModule(fs.readFileSync(filepath,"utf8"),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
    }).outputText;
    const mod = new Module(filepath,module);
    mod.filename=filepath;
    mod.paths=Module._nodeModulePaths(path.dirname(filepath));
    mod._compile(compiled,filepath);
    return mod.exports;
  } finally { Module._load=original; }
}
const state = values => ({updates:[],upserts:0,updateResults:[],readResults:[],...values});
test("ambiguous successful database write is never retried or acknowledged locally",async ()=>{
  const s=state({
    updateResults:[{data:null,error:{message:"connection lost after commit"}}],
    readResults:[{data:{processed_at:"2026-10-24T12:00:00Z",processing_lease_token:null},error:null}],
  });
  const outcome=await loadReplay(s).replayStoredIfoodEvents(restaurantId,"merchant-1");
  assert.equal(outcome.lostLeases,1);
  assert.equal(outcome.retryEventsScheduled,0);
  assert.equal(outcome.processed,0);
  assert.equal(s.updates.length,1);
});
test("new lease owner blocks stale worker from rescheduling",async ()=>{
  const s=state({
    updateResults:[{data:null,error:{message:"uncertain write"}}],
    readResults:[{data:{processed_at:null,processing_lease_token:"lease-b"},error:null}],
  });
  const outcome=await loadReplay(s).replayStoredIfoodEvents(restaurantId,"merchant-1");
  assert.equal(outcome.lostLeases,1);
  assert.equal(s.updates.length,1);
});
test("unavailable read after ambiguous write fails closed",async ()=>{
  const s=state({
    updateResults:[{data:null,error:{message:"uncertain write"}}],
    readResults:[{data:null,error:{message:"read failed"}}],
  });
  const outcome=await loadReplay(s).replayStoredIfoodEvents(restaurantId,"merchant-1");
  assert.equal(outcome.lostLeases,1);
  assert.equal(s.updates.length,1);
});
test("confirmed failed write under owned lease retries once without ACK",async ()=>{
  const s=state({
    updateResults:[
      {data:null,error:{message:"write failed"}},
      {data:{id:event.id},error:null},
    ],
    readResults:[{data:{processed_at:null,processing_lease_token:"lease-a"},error:null}],
  });
  const outcome=await loadReplay(s).replayStoredIfoodEvents(restaurantId,"merchant-1");
  assert.equal(outcome.processed,0);
  assert.equal(outcome.retryEventsScheduled,1);
  assert.equal(s.updates.length,2);
  assert.equal(s.updates[1].retry_count,1);
});
