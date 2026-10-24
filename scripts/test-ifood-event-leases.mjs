// Operates ONLY on the isolated Supabase started by Commercial E2E.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
if (process.env.IFOOD_LEASE_E2E !== "1") {
  console.log("Skipping lease integration test outside isolated E2E.");
} else {
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!url || !serviceKey || !anonKey || !["localhost","127.0.0.1"].includes(new URL(url).hostname)){
  throw new Error("iFood lease test must use the isolated local database.");
}
const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
const anon=createClient(url,anonKey,{auth:{persistSession:false}});
const restaurantId="11111111-1111-4111-8111-111111111111";
const merchantId="merchant-ci-"+randomUUID();
const eventId="lease-ci-"+randomUUID();
const createdEventIds = [];
function check(error,label){if(error)throw new Error(label+": "+error.message);}
try{
  const enabled=await admin.from("ifood_integrations").upsert({
    restaurant_id:restaurantId,merchant_id:merchantId,
    order_sync_enabled:true,status:"connected",
  },{onConflict:"restaurant_id"});
  check(enabled.error,"create isolated integration");
  const inserted=await admin.from("ifood_order_events").insert({
    restaurant_id:restaurantId,merchant_id:merchantId,
    ifood_event_id:eventId,ifood_order_id:"order-ci",event_code:"PLC",
    raw_payload:{id:eventId,orderId:"order-ci",merchantId,code:"PLC"},
  }).select("id").single();
  check(inserted.error,"insert isolated event");
  createdEventIds.push(inserted.data.id);
  const claim=(r,m)=>admin.rpc("claim_ifood_pending_events",{
    p_restaurant_id:r,p_merchant_id:m,p_batch_size:10,
  });
  const [first,second]=await Promise.all([claim(restaurantId,merchantId),claim(restaurantId,merchantId)]);
  check(first.error || second.error,"concurrent claim");
  assert.equal(first.data.length+second.data.length,1,"concurrent workers cannot share one lease");
  const row=(first.data.length?first.data:second.data)[0];
  assert.ok(row.processing_lease_token);
  assert.equal(row.id,createdEventIds[0]);
  const wrongMerchant=await claim(restaurantId,"merchant-unauthorized");
  check(wrongMerchant.error,"wrong merchant");
  assert.equal(wrongMerchant.data.length,0);
  const wrongTenant=await claim("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",merchantId);
  check(wrongTenant.error,"wrong tenant");
  assert.equal(wrongTenant.data.length,0);
  const publicAttempt=await anon.rpc("claim_ifood_pending_events",{
    p_restaurant_id:restaurantId,p_merchant_id:merchantId,p_batch_size:10,
  });
  assert.ok(publicAttempt.error,"public clients must not reserve an event");
  const stolen=await admin.from("ifood_order_events").update({
    processed_at:new Date().toISOString(),
  }).eq("id",row.id).eq("processing_lease_token",randomUUID()).select("id");
  check(stolen.error,"wrong token guard");
  assert.equal(stolen.data.length,0);
  const marked=await admin.from("ifood_order_events").update({
    processed_at:new Date().toISOString(),
    processing_lease_token:null,processing_lease_until:null,
  }).eq("id",row.id).eq("processing_lease_token",row.processing_lease_token).select("id");
  check(marked.error,"correct claim guard");
  assert.equal(marked.data.length,1);
  const notClaimed=await claim(restaurantId,merchantId);
  check(notClaimed.error,"processed event check");
  assert.equal(notClaimed.data.length,0);

  // A lease that expired must be reclaimable, and old workers are fenced out.
  const secondEventId="lease-expired-"+randomUUID();
  const expiringRow=await admin.from("ifood_order_events").insert({
    restaurant_id:restaurantId,merchant_id:merchantId,
    ifood_event_id:secondEventId,ifood_order_id:"order-expired",
    event_code:"PLC",
    raw_payload:{id:secondEventId,orderId:"order-expired",merchantId,code:"PLC"},
  }).select("id").single();
  check(expiringRow.error,"second event");
  createdEventIds.push(expiringRow.data.id);
  const firstOwner=await claim(restaurantId,merchantId);
  check(firstOwner.error,"first owner");
  assert.equal(firstOwner.data.length,1);
  assert.equal(firstOwner.data[0].id,expiringRow.data.id);
  const tokenA=firstOwner.data[0].processing_lease_token;
  const expire=await admin.from("ifood_order_events")
    .update({processing_lease_until:new Date(Date.now()-1000).toISOString()})
    .eq("id",expiringRow.data.id);
  check(expire.error,"expire test lease");
  const expiredOwnerFinish=await admin.from("ifood_order_events")
    .update({processed_at:new Date().toISOString()})
    .eq("id",expiringRow.data.id).eq("processing_lease_token",tokenA)
    .gt("processing_lease_until",new Date().toISOString())
    .is("processed_at",null).select("id");
  check(expiredOwnerFinish.error,"expired owner fencing");
  assert.equal(expiredOwnerFinish.data.length,0);
  const secondOwner=await claim(restaurantId,merchantId);
  check(secondOwner.error,"second owner");
  assert.equal(secondOwner.data.length,1);
  assert.equal(secondOwner.data[0].id,expiringRow.data.id);
  const tokenB=secondOwner.data[0].processing_lease_token;
  assert.notEqual(tokenA,tokenB);
  const staleFinish=await admin.from("ifood_order_events")
    .update({processed_at:new Date().toISOString()})
    .eq("id",expiringRow.data.id).eq("processing_lease_token",tokenA)
    .gt("processing_lease_until",new Date().toISOString())
    .is("processed_at",null).select("id");
  check(staleFinish.error,"stale owner fencing");
  assert.equal(staleFinish.data.length,0);
  const freshFinish=await admin.from("ifood_order_events")
    .update({
      processed_at:new Date().toISOString(),processing_lease_token:null,
      processing_lease_until:null,
    }).eq("id",expiringRow.data.id).eq("processing_lease_token",tokenB)
    .gt("processing_lease_until",new Date().toISOString())
    .is("processed_at",null).select("id");
  check(freshFinish.error,"fresh owner completion");
  assert.equal(freshFinish.data.length,1);

  // Future retries must not be claimed until the scheduled time passes.
  const futureEventId="lease-future-"+randomUUID();
  const future=await admin.from("ifood_order_events").insert({
    restaurant_id:restaurantId,merchant_id:merchantId,
    ifood_event_id:futureEventId,ifood_order_id:"order-future",
    event_code:"PLC",next_retry_at:new Date(Date.now()+600000).toISOString(),
    raw_payload:{id:futureEventId,orderId:"order-future",merchantId,code:"PLC"},
  }).select("id").single();
  check(future.error,"future event");
  createdEventIds.push(future.data.id);
  const beforeDue=await claim(restaurantId,merchantId);
  check(beforeDue.error,"not yet due");
  assert.equal(beforeDue.data.length,0);
  const due=await admin.from("ifood_order_events")
    .update({next_retry_at:new Date(Date.now()-1000).toISOString()})
    .eq("id",future.data.id);
  check(due.error,"set due");
  const afterDue=await claim(restaurantId,merchantId);
  check(afterDue.error,"due event");
  assert.equal(afterDue.data.length,1);
  assert.equal(afterDue.data[0].id,future.data.id);
  // SKIP LOCKED partitions a backlog across two simultaneous database workers.
  const batchIds = Array.from({length:12},()=> "lease-batch-"+randomUUID());
  const batchRows = batchIds.map(id=>({
    restaurant_id:restaurantId,merchant_id:merchantId,ifood_event_id:id,
    ifood_order_id:"order-"+id,event_code:"PLC",
    raw_payload:{id,orderId:"order-"+id,merchantId,code:"PLC"},
  }));
  const seededBatch = await admin.from("ifood_order_events").insert(batchRows).select("id");
  check(seededBatch.error,"seed isolated multiworker backlog");
  createdEventIds.push(...seededBatch.data.map(row=>row.id));
  const [batchWorkerA,batchWorkerB] = await Promise.all([
    admin.rpc("claim_ifood_pending_events",{p_restaurant_id:restaurantId,p_merchant_id:merchantId,p_batch_size:999}),
    admin.rpc("claim_ifood_pending_events",{p_restaurant_id:restaurantId,p_merchant_id:merchantId,p_batch_size:999}),
  ]);
  check(batchWorkerA.error || batchWorkerB.error,"multiworker batch claims");
  const claimedRows=[...batchWorkerA.data,...batchWorkerB.data];
  assert.equal(claimedRows.length,12,"No backlog event may be claimed twice or lost");
  assert.ok(batchWorkerA.data.length<=10 && batchWorkerB.data.length<=10,"Batch size capped at 10");
  assert.equal(new Set(claimedRows.map(row=>row.id)).size,12,"Claims are disjoint");
  assert.equal(new Set(claimedRows.map(row=>row.processing_lease_token)).size,12,
    "Every claim must have an independent lease token");

  // Disabling a merchant blocks replay without touching its stored events.
  const disabledId="lease-disabled-"+randomUUID();
  const disabledRow=await admin.from("ifood_order_events").insert({
    restaurant_id:restaurantId,merchant_id:merchantId,ifood_event_id:disabledId,
    ifood_order_id:"order-disabled",event_code:"PLC",
    raw_payload:{id:disabledId,orderId:"order-disabled",merchantId,code:"PLC"},
  }).select("id").single();
  check(disabledRow.error,"seed disabled integration event");
  createdEventIds.push(disabledRow.data.id);
  check((await admin.from("ifood_integrations").update({order_sync_enabled:false})
    .eq("restaurant_id",restaurantId)).error,"disable isolated integration");
  const paused=await claim(restaurantId,merchantId);
  check(paused.error,"paused merchant claim");
  assert.equal(paused.data.length,0,"Disabled integrations cannot lease stored events");
  check((await admin.from("ifood_integrations").update({order_sync_enabled:true})
    .eq("restaurant_id",restaurantId)).error,"resume isolated integration");
  const resumed=await claim(restaurantId,merchantId);
  check(resumed.error,"resumed merchant claim");
  assert.equal(resumed.data.length,1);
  assert.equal(resumed.data[0].id,disabledRow.data.id);

  console.log("iFood isolated Postgres: concurrency, batch cap, pause/resume, expiry and stale fencing verified.");


}finally{
  if(createdEventIds.length){
    const removed=await admin.from("ifood_order_events").delete().in("id",createdEventIds);
    check(removed.error,"cleanup events");
  }
  const disabled=await admin.from("ifood_integrations").delete().eq("restaurant_id",restaurantId);
  check(disabled.error,"cleanup integration");
}

}
