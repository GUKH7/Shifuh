"use strict";
// Explicitly local, isolated Supabase; all ACK provider calls are injected mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

function localDb() {
  assert.equal(process.env.IFOOD_LEGACY_ACK_E2E, "1", "Isolated CI opt-in required");
  assert.equal(process.env.IFOOD_PERSISTED_REPLAY_ENABLED, "false", "Persistent replay MUST be off");
  const uri = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(uri.hostname), "REMOTE DATABASE FORBIDDEN");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(key, "Disposable local service role required");
  return createClient(uri.href, key, { auth: { persistSession:false, autoRefreshToken:false } });
}
function checked(response, label) {
  if (response.error) throw new Error(label + ": " + response.error.message);
  return response.data;
}
function loadTs(file) {
  const name = path.join(__dirname, "..", file);
  const compiled = ts.transpileModule(fs.readFileSync(name, "utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText;
  const loaded = new Module(name, module);
  loaded.filename = name;
  loaded.paths = Module._nodeModulePaths(path.dirname(name));
  loaded._compile(compiled, name);
  return loaded.exports;
}
function simulateLostReplyAfterSqlCommit(admin) {
  return { from(table) {
    const query = admin.from(table);
    const originalUpdate = query.update.bind(query);
    query.update = function(value) {
      const next = originalUpdate(value);
      if (value.acknowledged_at) {
        const originalThen = next.then.bind(next);
        next.then = (resolve, reject) =>
          originalThen(() => resolve({data:null,error:{message:"simulated SQL reply lost"}}), reject);
      }
      return next;
    };
    return query;
  } };
}
async function main() {
  const a = localDb(), b = localDb();
  const { deliverLegacyIfoodAcks } = loadTs("src/lib/ifood/legacy-ack-lease.ts");
  const { createIfoodCronBudget } = loadTs("src/lib/ifood/cron-budget.ts");
  const restaurant = "11111111-1111-4111-8111-111111111111";
  const merchant = "legacy-ack-" + randomUUID();
  const eventIds = ["race-" + randomUUID(),"lost-" + randomUUID(),"deadline-" + randomUUID()];
  let totalCalls = 0;
  const send = async (ids) => {
    totalCalls += 1;
    assert.ok(ids.every(id=>eventIds.includes(id)), "provider mock can only ACK test IDs");
    await new Promise(resolve=>setTimeout(resolve,75));
  };
  try {
    checked(await a.from("ifood_integrations").insert({
      restaurant_id:restaurant,merchant_id:merchant,status:"connected",order_sync_enabled:true
    }), "Seed synthetic merchant");
    checked(await a.from("ifood_order_events").insert(eventIds.map(id=>({
      restaurant_id:restaurant,merchant_id:merchant,
      ifood_event_id:id,ifood_order_id:"test-" + id,
      event_code:"PLC",processed_at:new Date().toISOString()
    }))), "Seed processed synthetic events");

    // Separate Supabase clients race to claim exactly the same ACK.
    const race = await Promise.all([
      deliverLegacyIfoodAcks(a,restaurant,merchant,[eventIds[0]],send),
      deliverLegacyIfoodAcks(b,restaurant,merchant,[eventIds[0]],send),
    ]);
    assert.equal(race.reduce((sum,x)=>sum+x,0),1, "Exactly one durable confirmation");
    assert.equal(totalCalls,1, "Two independent DB clients cannot double-send under a live lease");
    const first=checked(await a.from("ifood_order_events").select("acknowledged_at")
      .eq("restaurant_id",restaurant).eq("ifood_event_id",eventIds[0]).single(),"Race persisted");
    assert.ok(first.acknowledged_at);

    // The database commits an ACK, but the caller receives an injected lost reply.
    let lostCalls=0;
    await assert.rejects(deliverLegacyIfoodAcks(
      simulateLostReplyAfterSqlCommit(a),restaurant,merchant,[eventIds[1]],
      async ()=>{ lostCalls++; }
    ), /confirmação local ambígua sob lease/);
    const committed=checked(await a.from("ifood_order_events")
      .select("acknowledged_at").eq("restaurant_id",restaurant)
      .eq("ifood_event_id",eventIds[1]).single(),"Read post-commit lost response");
    assert.ok(committed.acknowledged_at, "SQL commit survives a lost HTTP reply");
    const retried=await deliverLegacyIfoodAcks(b,restaurant,merchant,[eventIds[1]],
      async ()=>{ lostCalls++; });
    assert.equal(retried,0);
    assert.equal(lostCalls,1,"Committed ACK is not resent after a lost response");

    // Scaled invocation deadline: the same 48/60 proportion, no real 60s wait.
    const budget=createIfoodCronBudget(90,15);
    const started=Date.now();
    try {
      await assert.rejects(deliverLegacyIfoodAcks(a,restaurant,merchant,[eventIds[2]],
        async (_,signal)=>new Promise((resolve,reject)=>{
          if(signal.aborted) return reject(signal.reason);
          signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
        }), budget.signal), /iFood cron budget exhausted/);
    } finally {
      budget.dispose();
    }
    assert.ok(Date.now()-started<1_000, "Stalled ACK is canceled well before simulated 60s limit");
    const suspended=checked(await a.from("ifood_order_events")
      .select("acknowledged_at,processing_lease_token,processing_lease_until")
      .eq("restaurant_id",restaurant).eq("ifood_event_id",eventIds[2]).single(),
      "Read aborted ACK");
    assert.equal(suspended.acknowledged_at,null);
    assert.ok(suspended.processing_lease_token, "Ambiguous call keeps owner lease");
    let duplicateAfterAbort=0;
    const skipped=await deliverLegacyIfoodAcks(b,restaurant,merchant,[eventIds[2]],
      async ()=>{duplicateAfterAbort++;});
    assert.equal(skipped,0);
    assert.equal(duplicateAfterAbort,0);

    console.log("HOMOLOG LEGACY ACK",JSON.stringify({
      independentDatabaseClients:2, duplicateProviderCallsUnderLiveLease:0,
      commitDespiteLostReply:true, resendAfterCommittedReplyLost:0,
      scaledCronBudgetMs:90, abortedBeforeConfigured60s:true,
      heldLeaseAfterAbort:true, replayEnabled:false
    }));
  } finally {
    checked(await a.from("ifood_order_events").delete()
      .eq("restaurant_id",restaurant).in("ifood_event_id",eventIds),"Cleanup isolated ACK rows");
    checked(await a.from("ifood_integrations").delete()
      .eq("restaurant_id",restaurant).eq("merchant_id",merchant),"Cleanup isolated merchant");
  }
}
main().catch(error=>{console.error("Local legacy ACK homologation failed",error);process.exitCode=1;});
