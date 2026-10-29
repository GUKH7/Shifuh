"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const root=path.join(__dirname,"..");
const sourcePath=path.join(root,"src/features/onboarding/readiness.ts");
const code=ts.transpileModule(fs.readFileSync(sourcePath,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const mod=new Module(sourcePath,module);
mod.filename=sourcePath;
mod.paths=Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(code,sourcePath);
const {evaluateOnboardingReadiness}=mod.exports;

function input(overrides={}) {
  return {
    restaurant:{
      name:"Loja Teste",slug:"loja-teste",phone:"11987654321",
      work_hours:[{day_id:1,is_open:true,open_time:"09:00",close_time:"18:00"}],
      pickup_enabled:true,delivery_tiers:[],accepted_payment_methods:["pix"],
      ...(overrides.restaurant||{})
    },
    categories: overrides.categories??[{id:"cat-1",name:"Lanches",is_active:true}],
    products: overrides.products??[{id:"product-1",category_id:"cat-1",name:"Hambúrguer",is_active:true,price:24}]
  };
}
const section=(r,id)=>r.steps.find(step=>step.id===id);

test("valid persisted fields yield four configured steps but no publish action",()=>{
  const r=evaluateOnboardingReadiness(input());
  assert.deepEqual([r.completeCount,r.totalCount,r.percent,r.readyForReview],[4,4,100,true]);
  assert.equal(r.publicSlug,"loja-teste");
});
test("identity requires phone with DDD",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{phone:"sem-telefone"}}));
  assert.equal(section(r,"identity").status,"incomplete");
  assert.match(section(r,"identity").issues.join(" "),/telefone/);
});
test("pickup-only store does not require a delivery tier or delivery address",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{pickup_enabled:true,delivery_tiers:[],address_street:null}}));
  assert.equal(section(r,"operations").status,"complete");
});
test("a store without pickup or valid delivery is incomplete",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{pickup_enabled:false,delivery_tiers:[]}}));
  assert.equal(section(r,"operations").status,"incomplete");
});
test("delivery rules require complete restaurant address",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{pickup_enabled:false,delivery_tiers:[{distance:4,price:6,time:40}]}}));
  assert.match(section(r,"operations").issues.join(" "),/endereço/);
});
test("tier delivery with complete address is accepted",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{
    pickup_enabled:false,delivery_tiers:[{distance:4,price:6,time:40}],
    address_street:"Rua",address_number:"10",address_city:"Suzano",address_state:"SP"
  }}));
  assert.equal(section(r,"operations").status,"complete");
});
test("per-kilometer delivery rules work",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{
    pickup_enabled:false,delivery_tiers:[{mode:"per_km",price_per_km:2,max_distance:6}],
    address_street:"Rua",address_number:"10",address_city:"Suzano",address_state:"SP"
  }}));
  assert.equal(section(r,"operations").status,"complete");
});
test("working hours missing or closed cannot be marked ready",()=>{
  for(const hours of [undefined,null,[],[{is_open:false,open_time:"09:00",close_time:"18:00"}]]){
    const r=evaluateOnboardingReadiness(input({restaurant:{work_hours:hours}}));
    assert.equal(section(r,"operations").status,"incomplete");
  }
});
test("catalog requires one active category and product with nonnegative price",()=>{
  const cases=[
    {categories:[]},
    {categories:[{id:"cat-1",name:"Lanches",is_active:false}]},
    {products:[{category_id:"cat-1",name:"Hambúrguer",is_active:false,price:24}]},
    {products:[{category_id:"other",name:"Hambúrguer",is_active:true,price:24}]},
    {products:[{category_id:"cat-1",name:"Hambúrguer",is_active:true,price:-5}]}
  ];
  for(const c of cases){
    assert.equal(section(evaluateOnboardingReadiness(input(c)),"catalog").status,"incomplete");
  }
});
test("payment defaults absent from database do not appear confirmed",()=>{
  for(const value of [null,undefined,[],["unknown"]]){
    const r=evaluateOnboardingReadiness(input({restaurant:{accepted_payment_methods:value}}));
    assert.equal(section(r,"payments").status,"incomplete");
  }
});
test("a supported payment method counts as configured",()=>{
  const r=evaluateOnboardingReadiness(input({restaurant:{accepted_payment_methods:["cash","pix"]}}));
  assert.equal(section(r,"payments").status,"complete");
});
test("progress is recomputed when persisted data becomes invalid",()=>{
  const before=evaluateOnboardingReadiness(input());
  const after=evaluateOnboardingReadiness(input({products:[]}));
  assert.equal(before.completeCount,4);
  assert.equal(after.completeCount,3);
  assert.equal(after.percent,75);
  assert.equal(after.readyForReview,false);
});
test("new route preserves authentication and uses scoped read-only Supabase queries",()=>{
  const page=fs.readFileSync(path.join(root,"src/features/onboarding/OnboardingWorkspace.tsx"),"utf8");
  const route=fs.readFileSync(path.join(root,"src/app/admin/(painel)/onboarding/page.tsx"),"utf8");
  assert.match(page,/getCurrentRestaurant\(client\)/);
  assert.match(page,/\.eq\("restaurant_id", restaurant\.id\)/);
  assert.match(page,/router\.replace\("\/admin\/login"\)/);
  assert.match(page,/router\.replace\("\/admin\/setup"\)/);
  assert.match(route,/OnboardingWorkspace/);
  assert.doesNotMatch(page,/\.upsert\(|\.insert\(|\.update\(|\.delete\(|service_role|createAdminClient/);
});
test("preview is disabled for this branch without changing the main deployment guard",()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
  assert.equal(config.git.deploymentEnabled.main,false);
  assert.equal(config.git.deploymentEnabled["feature/onboarding-pr-a-20261029"],false);
});
