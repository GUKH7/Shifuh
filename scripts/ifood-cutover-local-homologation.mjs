import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function verifyCutoverLocally() {
  assert.equal(process.env.IFOOD_MERCHANT_UNIQUENESS_E2E, "1");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  assert.ok(["localhost","127.0.0.1"].includes(api.hostname));
  const status = execFileSync("supabase", ["status","-o","env"], {encoding:"utf8"});
  const value = status.match(/^DB_URL="([^"]+)"$/m)?.[1];
  assert.ok(value, "Local DB_URL required");
  const url = new URL(value);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname), "Remote database forbidden");
  assert.equal(url.protocol,"postgresql:");
  assert.equal(url.username,"postgres");
  const setup = readFileSync(fileURLToPath(new URL("./ifood-merchant-cutover-procedure.sql",import.meta.url)),"utf8");
  function run(sql) {
    return new Promise((resolve,reject)=>{
      const child=spawn("psql",["-X","-qAt","-v","ON_ERROR_STOP=1"],{env:{...process.env,PGDATABASE:value},stdio:["pipe","pipe","pipe"]});
      let stdout="", stderr="";
      child.stdout.on("data",d=>stdout+=d);
      child.stderr.on("data",d=>stderr+=d);
      child.on("error",reject);
      child.on("close",code=>resolve({code,stdout:stdout.trim(),stderr}));
      child.stdin.end(sql);
    });
  }
  const checked=async sql=>{const r=await run(sql);assert.equal(r.code,0,r.stderr);return r.stdout;};
  const restaurant="11111111-1111-4111-8111-111111111111";
  const other="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const old=randomUUID(), target=randomUUID(), conflict=randomUUID(), id=randomUUID(), event=randomUUID();
  const call=(from,to,rollback=false)=>`select pg_temp.replace_ifood_binding('${restaurant}','${from}','${to}',${rollback});`;
  const current=()=>checked(`select merchant_id from public.ifood_integrations where restaurant_id='${restaurant}';`);
  assert.equal(await checked(`select count(*) from public.ifood_integrations where restaurant_id in ('${restaurant}','${other}');`),"0");
  await checked(setup);
  try {
    await checked(`insert into public.ifood_integrations(id,restaurant_id,merchant_id,order_sync_enabled,catalog_sync_enabled,notes)
      values ('${id}','${restaurant}','${old}',false,false,'local-fixture');
      insert into public.ifood_integrations(restaurant_id,merchant_id,order_sync_enabled,catalog_sync_enabled)
      values ('${other}','${conflict}',false,false);
      delete from public.ifood_integrations where restaurant_id='${other}';
      insert into public.ifood_order_events(restaurant_id,ifood_event_id,ifood_order_id,merchant_id,event_code,processed_at)
      values ('${restaurant}','${event}','${randomUUID()}','${old}','PLC',now());`);
    const hash=await checked(`select md5(to_jsonb(e)::text) from public.ifood_order_events e where ifood_event_id='${event}';`);
    const collision=await run(setup+"\nbegin;"+call(old,conflict)+"commit;");
    assert.notEqual(collision.code,0);assert.match(collision.stderr,/Target merchant unavailable/);
    assert.equal(await current(),old);
    await checked(`update public.ifood_order_events set processing_lease_until=now()+interval '10 minutes' where ifood_event_id='${event}';`);
    const busy=await run(setup+"\nbegin;"+call(old,target)+"commit;");
    assert.notEqual(busy.code,0);assert.match(busy.stderr,/Active operations or leases/);
    await checked(`update public.ifood_order_events set processing_lease_until=null where ifood_event_id='${event}';`);
    const preserved=await checked(`select md5(to_jsonb(e)::text) from public.ifood_order_events e where ifood_event_id='${event}';`);
    assert.ok(hash && preserved);
    const interruption=await run(setup+"\nbegin;"+call(old,target)+"select 1/0; commit;");
    assert.notEqual(interruption.code,0); assert.equal(await current(),old);
    assert.equal(await checked(`select count(*) from ifood_private.merchant_ownership where merchant_key='${target}';`),"0");
    const racers=await Promise.all([run(setup+"\nbegin;"+call(old,target)+"select pg_sleep(0.5);commit;"),run(setup+"\nbegin;"+call(old,target)+"commit;")]);
    assert.equal(racers.filter(r=>r.code===0).length,1,JSON.stringify(racers.map(r=>({code:r.code,stderr:r.stderr}))));
    assert.equal(await current(),target);
    assert.equal(await checked(`select count(*) from ifood_private.merchant_ownership where restaurant_id='${restaurant}' and merchant_key in ('${old}','${target}');`),"2");
    assert.equal(await checked(`select md5(to_jsonb(e)::text) from public.ifood_order_events e where ifood_event_id='${event}';`),preserved);
    await checked(setup+"\nbegin;"+call(target,old,true)+"commit;");
    assert.equal(await current(),old);
    assert.equal(await checked(`select notes from public.ifood_integrations where id='${id}' and not order_sync_enabled and not catalog_sync_enabled;`),"local-fixture");
    assert.equal(await checked(`select count(*) from ifood_private.merchant_ownership where restaurant_id='${restaurant}' and merchant_key in ('${old}','${target}');`),"2");
    console.log("iFood cutover: reserved target rejected, lease blocked, transaction interruption rolled back, one concurrent replacement committed, prior snapshot restored with both ownership reservations intact.");
  } finally {
    await checked(`delete from public.ifood_order_events where restaurant_id='${restaurant}' and ifood_event_id='${event}'; delete from public.ifood_integrations where restaurant_id in ('${restaurant}','${other}');`);
  }
}
