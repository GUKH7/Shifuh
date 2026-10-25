"use strict";

// Distributed ACK claim, crash and fencing. Only disposable local Supabase.
// No real provider calls: ACK delivery is an append-only local fixture file.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const CHILD_CRASH_CODE = 83;

function localDb() {
  assert.equal(process.env.IFOOD_ACK_MULTIWORKER_E2E, "1", "Explicit isolated CI opt-in required");
  assert.equal(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "true", "Only disposable replay enabled");
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "REMOTE DATABASE FORBIDDEN");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "Local service role required");
  return createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {persistSession:false,autoRefreshToken:false},
  });
}
function checked(value,label) {
  if(value.error) throw new Error(label+": "+value.error.message);
  return value.data;
}
function loadTs(relative,mocks){
  const filename=path.resolve(__dirname,"..",relative);
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const prev=Module._load;
  Module._load=function(request,parent,isMain){
    if(Object.hasOwn(mocks,request)) return mocks[request];
    return prev.call(this,request,parent,isMain);
  };
  try {
    const m=new Module(filename,module);
    m.filename=filename;
    m.paths=Module._nodeModulePaths(path.dirname(filename));
    m._compile(compiled,filename);
    return m.exports;
  } finally { Module._load=prev; }
}
function orderDetails(id){
  return {
    id,displayId:"ACK-LEASE-TEST",isTest:true,orderType:"DELIVERY",
    customer:{name:"Cliente de teste",phone:{number:"11999999999"}},
    delivery:{deliveryAddress:{streetName:"Rua Teste",streetNumber:"1",city:"Suzano",state:"SP"}},
    items:[{name:"Produto de teste",quantity:1,unitPrice:25}],
    total:{subTotal:25,deliveryFee:0,orderAmount:25,benefits:0},
    payments:{methods:[{method:"CREDIT",type:"ONLINE"}]},
  };
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function until(predicate,label,timeout=12000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {
    if(await predicate()) return;
    await wait(30);
  }
  throw new Error("Timeout: "+label);
}
async function child() {
  const admin=localDb();
  const action=process.env.IFOOD_ACK_WORKER_ACTION;
  const merchant=process.env.IFOOD_ACK_WORKER_MERCHANT;
  const dir=process.env.IFOOD_ACK_WORKER_DIR;
  const actor=process.env.IFOOD_ACK_WORKER_NAME;
  assert.ok(action && merchant && dir && actor);
  const sent=[];
  const provider={
    acknowledgeIfoodOrderEvents:async (ids, signal)=>{
      sent.push(...ids);
      fs.appendFileSync(path.join(dir,"provider.log"),
        JSON.stringify({actor,ids,accepted:true})+"\n");
      if(action==="crash") process.exit(CHILD_CRASH_CODE);
      if(action==="block"){
        fs.writeFileSync(path.join(dir,"provider-accepted"),actor);
        fs.writeFileSync(path.join(dir,"accepted-"+actor),"1");
        await until(()=>fs.existsSync(path.join(dir,"release")) || signal?.aborted,
          "release blocked ACK provider or abort after lease loss");
        if (signal?.aborted) throw new Error("Simulated provider request aborted after lease loss");
      }
      if(action==="timeout"){
        await until(()=>signal?.aborted,"bound HTTP timeout in disposable CI",3000);
        throw new Error("Synthetic HTTP operation aborted at deadline");
      }
    },
    IfoodApiError:class extends Error{},
  };
  const mocks={
    "@/lib/supabase/server":{createAdminClient:()=>admin},
    "@/lib/ifood/orders":provider,
    "@/lib/ifood/order-sync":{
      syncIfoodOrdersForRestaurant:async()=>({
        eventsReceived:0,eventsProcessed:0,eventsAcknowledged:0,
        duplicateEvents:0,pendingEvents:0,failedEventIds:[],
        upstreamRetryAfterMs:0,touchedOrders:[],
      }),
    },
    "@/lib/ifood/event-replay":{
      isIfoodReplayEnabled:()=>true,
      replayStoredIfoodEvents:async()=>({
        claimed:0,processed:0,temporaryFailures:0,retryEventsScheduled:0,
        deadLetteredEvents:0,lostLeases:0,maxRetryAfterMs:0,
      }),
      inspectIfoodQueue:async()=>({pending:0,awaitingAcknowledgement:0,deadLettered:0}),
    },
  };
  const resilience=loadTs("src/lib/ifood/order-sync-resilience.ts",mocks);
  const result=await resilience.syncIfoodOrdersWithResilience({
    restaurantId:RESTAURANT,merchantId:merchant,source:"cron",maxAttempts:1,
  });
  console.log("ACK_WORKER",JSON.stringify({
    actor,action,recovered:result.pendingAcknowledgementsRecovered,sent,
  }));
}
function start(action,actor,vars){
  const p=spawn(process.execPath,[__filename,"--child"],{
    cwd:path.resolve(__dirname,".."),
    env:{...process.env,...vars,IFOOD_ACK_WORKER_ACTION:action,IFOOD_ACK_WORKER_NAME:actor},
    stdio:["ignore","pipe","pipe"],
  });
  let stdout="",stderr="";
  p.stdout.on("data",d=>stdout+=d);
  p.stderr.on("data",d=>stderr+=d);
  const done=new Promise((resolve,reject)=>{
    p.on("error",reject);
    p.on("exit",(code,signal)=>resolve({code,signal,stdout,stderr}));
  });
  const timeout=setTimeout(()=>p.kill("SIGKILL"),18000);
  return {p,done:done.finally(()=>clearTimeout(timeout)),logs:()=>({stdout,stderr})};
}
async function run(action,actor,vars,expectedCode=0){
  const instance=start(action,actor,vars);
  const completed=await instance.done;
  assert.equal(completed.code,expectedCode,
    actor+" worker exited unexpectedly: "+JSON.stringify(completed));
  if(expectedCode===0){
    const line=completed.stdout.split("\n").find(s=>s.startsWith("ACK_WORKER "));
    assert.ok(line,"Missing ACK result: "+JSON.stringify(completed));
    return JSON.parse(line.slice("ACK_WORKER ".length));
  }
  return completed;
}
function acceptedLog(dir){
  const p=path.join(dir,"provider.log");
  if(!fs.existsSync(p)) return [];
  return fs.readFileSync(p,"utf8").trim().split("\n")
    .filter(Boolean).map(x=>JSON.parse(x));
}

async function parent(){
  const admin=localDb();
  const merchant="ack-lease-mock-"+randomUUID();
  const orderId="ack-lease-order-"+randomUUID();
  const prefix="ack-lease-"+randomUUID();
  const ids=Array.from({length:3},(_,i)=>prefix+"-parallel-"+i);
  const interrupted=prefix+"-crashed";
  const stale=prefix+"-stale";
  const slow=prefix+"-slow";
  const late=prefix+"-late";
  const timedOut=prefix+"-timeout";
  const all=[...ids,interrupted,stale,slow,late,timedOut];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"shifuh-ack-lease-"));
  const env={IFOOD_ACK_WORKER_MERCHANT:merchant,IFOOD_ACK_WORKER_DIR:dir};
  const getRows=()=>admin.from("ifood_order_events")
    .select("id,ifood_event_id,processed_at,acknowledged_at,ack_lease_token,ack_lease_until,retry_count")
    .eq("restaurant_id",RESTAURANT).in("ifood_event_id",all);
  let rowIds=[],localOrderId=null;
  try {
    checked(await admin.from("ifood_integrations").upsert({
      restaurant_id:RESTAURANT,merchant_id:merchant,status:"connected",order_sync_enabled:true,
    },{onConflict:"restaurant_id"}),"Seed fixture merchant");

    const orderSync=loadTs("src/lib/ifood/order-sync.ts",{
      "@/lib/supabase/server":{createAdminClient:()=>admin},
      "@/lib/ifood/orders":{
        getIfoodOrderDetails:async()=>orderDetails(orderId),
        mapIfoodEventCodeToStatus:()=> "pending",
      },
    });
    const saved=await orderSync.upsertLocalOrderFromIfood(admin,RESTAURANT,{
      id:prefix+"-source",merchantId:merchant,orderId,code:"PLC",
    });
    localOrderId=saved.localOrderId;
    assert.ok(localOrderId);

    const seed=checked(await admin.from("ifood_order_events").insert(all.map(id=>({
      restaurant_id:RESTAURANT,merchant_id:merchant,
      ifood_event_id:id,ifood_order_id:orderId,event_code:"PLC",
      processed_at:new Date().toISOString(),
      local_order_id:localOrderId,
      raw_payload:{id,orderId,merchantId:merchant,code:"PLC"},
      ...([interrupted,stale,slow,late,timedOut].includes(id)
        ? {ack_lease_until:new Date(Date.now()+60*60*1000).toISOString(),
          ack_lease_token:randomUUID()} : {}),
    }))).select("id"),"Seed five processed synthetic ACK events");
    rowIds=seed.map(x=>x.id);
    assert.equal(rowIds.length,8);

    // SECURITY: RPC is callable only with the service role, scoped to the
    // configured restaurant and merchant and an enabled integration.
    const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
        auth:{persistSession:false,autoRefreshToken:false},
      });
    const unauthorized=await anon.rpc("claim_ifood_pending_acks",{
      p_restaurant_id:RESTAURANT,p_merchant_id:merchant,p_batch_size:2,
    });
    assert.ok(unauthorized.error,"Untrusted client cannot reserve ACK payloads");
    const wrongMerchant=checked(await admin.rpc("claim_ifood_pending_acks",{
      p_restaurant_id:RESTAURANT,p_merchant_id:merchant+"-wrong",p_batch_size:1,
    }),"Check merchant isolation");
    assert.equal(wrongMerchant.length,0);

    // Three genuinely separate processes compete for the exact same
    // pending IDs. Only one can send the batch while its DB lease is valid.
    const owner=start("block","owner",{...env});
    let others=[];
    try {
      await until(()=>fs.existsSync(path.join(dir,"provider-accepted")),
        "owner must have claimed and sent its ACK batch");
      others=await Promise.all([
        run("normal","racer-1",env),
        run("normal","racer-2",env),
      ]);
      assert.deepEqual(others.map(x=>x.recovered),[0,0],
        "Other instances cannot recover a batch already leased");
      assert.deepEqual(others.map(x=>x.sent.length),[0,0],
        "No duplicate provider calls during active lease");
      assert.equal(acceptedLog(dir).length,1);
      fs.writeFileSync(path.join(dir,"release"),"1");
      const done=await owner.done;
      assert.equal(done.code,0,"Owner failed: "+JSON.stringify(done));
      const row=JSON.parse(done.stdout.split("\n")
        .find(x=>x.startsWith("ACK_WORKER ")).slice("ACK_WORKER ".length));
      assert.equal(row.recovered,3);
      assert.deepEqual(new Set(row.sent),new Set(ids));
      assert.equal(acceptedLog(dir).length,1,"Only one provider send for three ACKs");
    } finally {
      fs.writeFileSync(path.join(dir,"release"),"1");
      if(owner.p.exitCode===null) owner.p.kill("SIGKILL");
      await owner.done.catch(()=>{});
    }
    const afterOwner=checked(await getRows(),"Inspect owner ACK completion");
    assert.ok(afterOwner.filter(r=>ids.includes(r.ifood_event_id))
      .every(r=>r.acknowledged_at && !r.ack_lease_token),
      "All three events must be durably ACKed");
    const repeat=await run("normal","post-commit",env);
    assert.equal(repeat.recovered,0);
    assert.equal(repeat.sent.length,0);

    // A worker dies after the mock provider accepts, but before DB commit.
    // The lease stays held. After synthetic expiry another process retries
    // the same ID: at-least-once semantics, NOT exactly-once guarantees.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_token:null,ack_lease_until:null,
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",interrupted),
      "Release initial synthetic hold for crash case");
    const killed=await run("crash","crash-owner",env,CHILD_CRASH_CODE);
    assert.equal(acceptedLog(dir).length,2);
    const afterCrash=checked(await getRows(),"ACK persistence after crash")
      .find(r=>r.ifood_event_id===interrupted);
    assert.equal(afterCrash.acknowledged_at,null);
    assert.ok(afterCrash.ack_lease_token);
    const immediate=await run("normal","too-early",env);
    assert.equal(immediate.recovered,0);
    assert.equal(immediate.sent.length,0);
    checked(await admin.from("ifood_order_events")
      .update({ack_lease_until:new Date(Date.now()-1000).toISOString()})
      .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",interrupted),
      "Advance ONLY synthetic crash lease");
    const restarted=await run("normal","fresh-worker",env);
    assert.equal(restarted.recovered,1);
    assert.deepEqual(restarted.sent,[interrupted]);
    assert.equal(acceptedLog(dir).length,3);
    assert.ok(checked(await getRows(),"Recovered crash ACK")
      .find(r=>r.ifood_event_id===interrupted).acknowledged_at);

    // Lease fencing: an obsolete worker must not mark a reclaimed event
    // ACKed even if it still holds the stale token in memory.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_token:null,ack_lease_until:null,
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",stale),
      "Release initial hold for stale worker");
    const oldClaim=checked(await admin.rpc("claim_ifood_pending_acks",{
      p_restaurant_id:RESTAURANT,p_merchant_id:merchant,p_batch_size:1,
    }),"First stale-worker claim");
    assert.equal(oldClaim.length,1);
    assert.equal(oldClaim[0].ifood_event_id,stale);
    checked(await admin.from("ifood_order_events").update({
      ack_lease_until:new Date(Date.now()-1000).toISOString(),
    }).eq("id",oldClaim[0].id),"Simulate lease expiry");
    const newClaim=checked(await admin.rpc("claim_ifood_pending_acks",{
      p_restaurant_id:RESTAURANT,p_merchant_id:merchant,p_batch_size:1,
    }),"Second worker reclaim");
    assert.equal(newClaim.length,1);
    assert.notEqual(newClaim[0].ack_lease_token,oldClaim[0].ack_lease_token);
    const staleWrite=checked(await admin.from("ifood_order_events")
      .update({acknowledged_at:new Date().toISOString()})
      .eq("id",oldClaim[0].id)
      .eq("ack_lease_token",oldClaim[0].ack_lease_token)
      .gt("ack_lease_until",new Date().toISOString())
      .is("acknowledged_at",null).select("id"),"Fenced stale completion");
    assert.equal(staleWrite.length,0,"Stale worker cannot complete other worker's ACK");
    assert.equal(checked(await getRows(),"After stale fenced write")
      .find(r=>r.ifood_event_id===stale).acknowledged_at,null);
    // Reclaimed lease eventually completes, never leaking old tokens.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_until:new Date(Date.now()-1000).toISOString(),
    }).eq("id",oldClaim[0].id),"Expire second lease for fresh recovery");
    const staleRecovered=await run("normal","fresh-after-fencing",env);
    assert.equal(staleRecovered.recovered,1);
    assert.deepEqual(staleRecovered.sent,[stale]);

    // Slow outbound ACK that would outlast an artificially shortened lease.
    // The test accelerates only ack_lease_until; the heartbeat must extend
    // the same token while the provider remains blocked and competitors poll.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_token:null,ack_lease_until:null,
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",slow),
      "Release local synthetic hold for slow ACK");
    fs.rmSync(path.join(dir,"release"),{force:true});
    const slowOwner=start("block","slow-owner",env);
    try {
      await until(()=>fs.existsSync(path.join(dir,"accepted-slow-owner")),
        "slow worker must reach provider");
      const slowBefore=checked(await getRows(),"Read slow worker lease")
        .find(r=>r.ifood_event_id===slow);
      assert.ok(slowBefore.ack_lease_token);
      checked(await admin.from("ifood_order_events")
        .update({ack_lease_until:new Date(Date.now()+180).toISOString()})
        .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",slow),
        "Accelerate only synthetic slow-worker lease");
      await until(async()=>{
        const row=checked(await getRows(),"Inspect ACK heartbeat")
          .find(r=>r.ifood_event_id===slow);
        return row.ack_lease_token===slowBefore.ack_lease_token &&
          Date.parse(row.ack_lease_until)>Date.now()+120000;
      },"heartbeat must extend lease before simulated expiry",3000);
      const competitors=await Promise.all([
        run("normal","slow-racer-1",env),
        run("normal","slow-racer-2",env),
      ]);
      assert.ok(competitors.every(r=>r.sent.length===0 && r.recovered===0),
        "No competing worker can send while slow owner renews");
      assert.equal(acceptedLog(dir).filter(x=>x.ids.includes(slow)).length,1);
      fs.writeFileSync(path.join(dir,"release"),"1");
      const finished=await slowOwner.done;
      assert.equal(finished.code,0,"Renewed slow owner failed: "+JSON.stringify(finished));
      assert.equal(JSON.parse(finished.stdout.split("\n")
        .find(x=>x.startsWith("ACK_WORKER ")).slice("ACK_WORKER ".length)).recovered,1);
      assert.ok(checked(await getRows(),"Slow ACK persisted")
        .find(r=>r.ifood_event_id===slow).acknowledged_at);
    } finally {
      fs.writeFileSync(path.join(dir,"release"),"1");
      if(slowOwner.p.exitCode===null) slowOwner.p.kill("SIGKILL");
      await slowOwner.done.catch(()=>{});
    }

    // Simulate an expired lease while the original HTTP response is blocked.
    // Its heartbeat discovers lost ownership, aborts the old transport, and
    // an independent worker completes with a new token. Late completion is fenced.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_token:null,ack_lease_until:null,
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",late),
      "Release local synthetic hold for late ACK");
    fs.rmSync(path.join(dir,"release"),{force:true});
    const oldOwner=start("block","late-owner",env);
    try {
      await until(()=>fs.existsSync(path.join(dir,"accepted-late-owner")),
        "late owner must reach provider");
      const oldLease=checked(await getRows(),"Read late owner lease")
        .find(r=>r.ifood_event_id===late);
      // Force a deterministic virtual handoff. Directly assigning a new
      // token in the disposable database represents another instance winning
      // a claim after expiry. Otherwise the 40ms heartbeat and a spawned
      // process race in CI, making this validation nondeterministic.
      const handedOffToken=randomUUID();
      checked(await admin.from("ifood_order_events")
        .update({ack_lease_token:handedOffToken,
          ack_lease_until:new Date(Date.now()+150000).toISOString()})
        .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",late)
        .eq("ack_lease_token",oldLease.ack_lease_token),
        "Simulate replacement ACK lease ownership");
      const oldFinished=await oldOwner.done;
      assert.equal(oldFinished.code,0,"Expired owner cleanup failed: "+JSON.stringify(oldFinished));
      const oldSummary=JSON.parse(oldFinished.stdout.split("\n")
        .find(x=>x.startsWith("ACK_WORKER ")).slice("ACK_WORKER ".length));
      assert.equal(oldSummary.recovered,0,"Stale worker must not mark ACK after lease expiry");
      const fenced=checked(await getRows(),"Check token after stale ACK reply")
        .find(r=>r.ifood_event_id===late);
      assert.equal(fenced.acknowledged_at,null);
      assert.equal(fenced.ack_lease_token,handedOffToken,
        "Stale worker cannot overwrite new owner's token");
      const stillOwned=await run("normal","late-waiting-owner",env);
      assert.deepEqual(stillOwned.sent,[],
        "Unexpired replacement lease must prevent duplicate provider sends");
      checked(await admin.from("ifood_order_events")
        .update({ack_lease_until:new Date(Date.now()-1000).toISOString()})
        .eq("restaurant_id",RESTAURANT).eq("ifood_event_id",late)
        .eq("ack_lease_token",handedOffToken),
        "Expire only synthetic replacement lease");
      const newOwner=await run("normal","late-new-owner",env);
      assert.deepEqual(newOwner.sent,[late]);
      assert.equal(newOwner.recovered,1);
      const finalLease=checked(await getRows(),"Check late ACK")
        .find(r=>r.ifood_event_id===late);
      assert.ok(finalLease.acknowledged_at);
      assert.equal(finalLease.ack_lease_token,null);
      assert.equal(acceptedLog(dir).filter(x=>x.ids.includes(late)).length,2,
        "After forced expiry at-least-once provider delivery can occur");
    } finally {
      fs.writeFileSync(path.join(dir,"release"),"1");
      if(oldOwner.p.exitCode===null) oldOwner.p.kill("SIGKILL");
      await oldOwner.done.catch(()=>{});
    }

    // Abort a hung provider mock with a local-only shortened 250ms deadline.
    // The lease remains held until its expiry; only then may another worker
    // retry that event. Production transport budget is 90 seconds.
    checked(await admin.from("ifood_order_events").update({
      ack_lease_token:null,ack_lease_until:null,
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",timedOut),
      "Release local synthetic hold for HTTP timeout");
    const timeoutResult=await run("timeout","timeout-owner",
      {...env,IFOOD_ACK_TEST_TRANSPORT_BUDGET_MS:"250"});
    assert.equal(timeoutResult.recovered,0);
    assert.equal(timeoutResult.sent.length,1);
    const timeoutPending=checked(await getRows(),"Read timeout pending event")
      .find(r=>r.ifood_event_id===timedOut);
    assert.equal(timeoutPending.acknowledged_at,null);
    assert.ok(timeoutPending.ack_lease_token);
    const blockedRetry=await run("normal","timeout-too-early",env);
    assert.equal(blockedRetry.recovered,0);
    assert.deepEqual(blockedRetry.sent,[]);
    checked(await admin.from("ifood_order_events").update({
      ack_lease_until:new Date(Date.now()-1000).toISOString(),
    }).eq("restaurant_id",RESTAURANT).eq("ifood_event_id",timedOut),
      "Advance timeout lease only on isolated database");
    const afterTimeout=await run("normal","timeout-recovered",env);
    assert.deepEqual(afterTimeout.sent,[timedOut]);
    assert.equal(afterTimeout.recovered,1);

    const final=checked(await getRows(),"Final ACK queue");
    assert.equal(final.length,8);
    assert.ok(final.every(r=>r.processed_at && r.acknowledged_at),
      "Every synthetic ACK must end durably acknowledged");
    const originalOrder=checked(await admin.from("orders").select("id")
      .eq("restaurant_id",RESTAURANT).eq("external_order_id",orderId),
      "Check no order duplication");
    assert.equal(originalOrder.length,1);
    assert.equal(originalOrder[0].id,localOrderId);
    console.log("HOMOLOG ACK multiworker",JSON.stringify({
      independentProcesses:3,competingWorkersWithoutProviderDuplicates:2,
      distinctParallelEvents:3,providerCallsWhileLeaseHeld:1,
      simulatedCrashAfterProviderAccepted:true,
      immediateDuplicateCallsAfterCrash:0,
      resendsAfterLeaseExpiry:1,
      staleCompletionUpdates:0,
      tenantIsolation:true,anonRpcBlocked:true,
      outstandingAcks:final.filter(r=>!r.acknowledged_at).length,
      slowAckLeaseRenewed:true,
      duplicateSendsDuringSlowAck:0,
      staleSlowOwnerConfirmations:0,
      abortedProviderOnLostLease:true,
      transportTimeoutEnforced:true,
      timeoutRecoveryAfterExpiry:true,
      duplicateOrders:0,
    }));
  } finally {
    if(rowIds.length) checked(await admin.from("ifood_order_events").delete()
      .in("id",rowIds),"Clean local ACK events");
    if(localOrderId){
      checked(await admin.from("order_items").delete().eq("order_id",localOrderId),
        "Clean local items");
      checked(await admin.from("orders").delete().eq("id",localOrderId),
        "Clean local order");
    }
    checked(await admin.from("ifood_integrations").delete()
      .eq("restaurant_id",RESTAURANT).eq("merchant_id",merchant),
      "Clean local integration");
    fs.rmSync(dir,{force:true,recursive:true});
  }
}
if(process.argv.includes("--child")) child().catch(e=>{
  console.error("ACK worker failure",e);process.exitCode=1;
}); else parent().catch(e=>{
  console.error("Isolated ACK multiworker failed",e);process.exitCode=1;
});
