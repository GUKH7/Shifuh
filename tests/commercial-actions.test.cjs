"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "src/features/commercial-actions/rules.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(compiled, sourcePath);
const {getCommercialActions} = mod.exports;
const base = () => ({ restaurant:{name:"Loja Teste",slug:"loja-teste"}, categories:[{id:"c1",name:"Lanches",is_active:true}], products:[{id:"p1",name:"Sanduíche",category_id:"c1",is_active:true,price:20}] });
test("ready store gets storefront, promotions and loyalty suggestions",()=>{
 const actions=getCommercialActions(base());
 assert.deepEqual(actions.map(a=>a.id),["storefront","promotions","loyalty"]);
 assert.equal(actions[0].href,"/loja-teste");
});
test("inactive products create review action without exposing product data",()=>{
 const input=base();input.products.push({id:"p2",name:"Outro",category_id:"c1",is_active:false,price:10});
 const actions=getCommercialActions(input);
 assert.equal(actions.find(a=>a.id==="unavailable").priority,"medium");
 assert.equal(actions.find(a=>a.id==="unavailable").href,"/admin/menu");
});
test("invalid category and prices never count as sellable",()=>{
 const input=base();input.categories[0].is_active=false;
 assert.equal(getCommercialActions(input)[0].id,"catalog");
 input.categories[0].is_active=true;input.products[0].price=-1;
 assert.equal(getCommercialActions(input)[0].id,"catalog");
});
test("empty store still has actionable fallback",()=>{
 const actions=getCommercialActions({restaurant:{},categories:[],products:[]});
 assert.equal(actions[0].id,"identity");
 assert.equal(actions[1].id,"catalog");
 assert.ok(actions.every(a=>a.href.startsWith("/")));
});
test("route is protected by administrative layout and uses scoped read-only queries",()=>{
 const page=fs.readFileSync(path.join(root,"src/features/commercial-actions/CommercialActionsWorkspace.tsx"),"utf8");
 assert.match(page,/getCurrentRestaurant\(client\)/);
 assert.match(page,/\.eq\("restaurant_id", restaurant\.id\)/);
 assert.match(page,/router\.replace\("\/admin\/login"\)/);
 assert.doesNotMatch(page,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|service_role/);
 assert.match(page,/sm:w-fit/);
});
