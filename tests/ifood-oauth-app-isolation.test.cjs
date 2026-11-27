const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
function load(name,mocks={}){
  const file=path.resolve("src/lib/ifood",name+".ts");
  const prev=Module._load;
  Module._load=function(req,parent,main){return Object.hasOwn(mocks,req)?mocks[req]:prev.call(this,req,parent,main)};
  try {
    const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
    mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
    return mod.exports;
  } finally {Module._load=prev;}
}
test("OAuth v2 isolates legacy rows, two concurrent credential pairs, rotation and persisted restart",async()=>{
  const keys=["IFOOD_CLIENT_ID","IFOOD_CLIENT_SECRET","IFOOD_TOKEN_ENCRYPTION_KEY","IFOOD_AUTH_URL","IFOOD_MERCHANT_API_BASE_URL","IFOOD_ORDERS_ONLY","IFOOD_CUTOVER_PAUSED"];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const originalFetch=global.fetch;
  const db=new Map(),reads=[],writes=[],requests=[];
  const admin={from(table){assert.equal(table,"ifood_oauth_tokens");return {
    select(){return {eq(col,scope){assert.equal(col,"environment");reads.push(scope);return {async maybeSingle(){return {data:db.get(scope)||null,error:null}}}}}},
    async upsert(row,opts){assert.equal(opts.onConflict,"environment");writes.push(row.environment);db.set(row.environment,row);return {error:null}}
  }}};
  try {
    Object.assign(process.env,{IFOOD_CLIENT_ID:"fake-test-app",IFOOD_CLIENT_SECRET:"fake-test-secret",IFOOD_TOKEN_ENCRYPTION_KEY:"local-only-test-encryption-key-32-characters",IFOOD_MERCHANT_API_BASE_URL:"http://127.0.0.1:1",IFOOD_AUTH_URL:"http://127.0.0.1:1/oauth",IFOOD_ORDERS_ONLY:"true"});
    delete process.env.IFOOD_CUTOVER_PAUSED;
    const config=load("token-encryption-config"),cap=load("capabilities");
    const store=load("auth-store",{"@/lib/supabase/server":{createAdminClient:()=>admin},"@/lib/ifood/token-encryption-config":config});
    db.set(store.getIfoodTokenEnvironment(),{access_token_encrypted:"legacy-never-read",expires_at:new Date(Date.now()+3600000).toISOString()});
    const loadCatalog=()=>load("catalog",{"@/lib/ifood/auth-store":store,"@/lib/ifood/token-encryption-config":config,"@/lib/ifood/capabilities":cap});
    const catalog=loadCatalog();
    let releaseA;
    const gateA=new Promise(resolve=>{releaseA=resolve});
    let enteredA;
    const startedA=new Promise(resolve=>{enteredA=resolve});
    global.fetch=async (url,init)=>{
      assert.equal(url,"http://127.0.0.1:1/oauth");
      const payload=new URLSearchParams(init.body);const id=payload.get("clientId"),secret=payload.get("clientSecret");
      requests.push([id,secret]);
      if(id==="fake-test-app"&&secret==="fake-test-secret"){enteredA();await gateA;}
      return new Response(JSON.stringify({accessToken:"token:"+id+":"+secret,expiresIn:3600}),{status:200});
    };
    const a1=catalog.getIfoodAccessToken(),a2=catalog.getIfoodAccessToken();
    await startedA;
    process.env.IFOOD_CLIENT_ID="fake-official-app";process.env.IFOOD_CLIENT_SECRET="fake-official-secret";
    const b=await catalog.getIfoodAccessToken();
    releaseA();
    const a=await a1;assert.equal(await a2,a);
    assert.notEqual(a,b);assert.equal(await catalog.getIfoodAccessToken(),b);assert.equal(requests.length,2);
    assert.equal(await loadCatalog().getIfoodAccessToken(),b);assert.equal(requests.length,2);
    process.env.IFOOD_CLIENT_SECRET="fake-rotated-secret";
    const rotated=await catalog.getIfoodAccessToken();assert.notEqual(rotated,b);assert.equal(requests.length,3);
    assert.equal(new Set(writes).size,3);
    assert.ok(reads.every(k=>k.includes(":v2:")&&!k.includes("fake-")));
    assert.ok([...db.entries()].filter(([k])=>k.includes(":v2:")).every(([,r])=>!r.access_token_encrypted.includes("token:")));
    await assert.rejects(catalog.listIfoodCatalogs("fake-merchant"),/não habilitado/);
    assert.equal(requests.length,3);
    const orders=load("orders",{"@/lib/ifood/catalog":catalog,"@/lib/ifood/capabilities":cap});
    process.env.IFOOD_CUTOVER_PAUSED="true";
    await assert.rejects(orders.pollIfoodOrderEvents("fake-merchant"),/suspensa/);
    assert.equal(requests.length,3);
  } finally {global.fetch=originalFetch;for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]}}
});
