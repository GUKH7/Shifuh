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
let eventRowId;
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
  eventRowId=inserted.data.id;
  const claim=(r,m)=>admin.rpc("claim_ifood_pending_events",{
    p_restaurant_id:r,p_merchant_id:m,p_batch_size:10,
  });
  const [first,second]=await Promise.all([claim(restaurantId,merchantId),claim(restaurantId,merchantId)]);
  check(first.error || second.error,"concurrent claim");
  assert.equal(first.data.length+second.data.length,1,"concurrent workers cannot share one lease");
  const row=(first.data.length?first.data:second.data)[0];
  assert.ok(row.processing_lease_token);
  assert.equal(row.id,eventRowId);
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
  console.log("iFood event claims verified against isolated Postgres.");
}finally{
  if(eventRowId){
    const removed=await admin.from("ifood_order_events").delete().eq("id",eventRowId);
    check(removed.error,"cleanup event");
  }
  const disabled=await admin.from("ifood_integrations").delete().eq("restaurant_id",restaurantId);
  check(disabled.error,"cleanup integration");
}

}
