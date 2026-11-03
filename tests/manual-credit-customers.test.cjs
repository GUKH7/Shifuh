"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "src/features/loyalty/manual-credit-customers.ts");
const js = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleRef = new Module(sourcePath, module);
moduleRef.filename = sourcePath;
moduleRef.paths = Module._nodeModulePaths(path.dirname(sourcePath));
moduleRef._compile(js, sourcePath);
const { customerLabel, customerInitials, formatCustomerPhone, searchManualCreditCustomers,
  recentManualCreditCustomers, rememberManualCreditCustomer } = moduleRef.exports;

const customers = [
  {id:"1",name:"João da Silva",phone:"11988887777"},
  {id:"2",name:"Maria Costa",phone:"+5511977776666"},
  {id:"3",name:null,phone:"11911112222"},
  {id:"4",name:"José Augusto",phone:"1133334444"},
  {id:"5",name:"Mariana Alves",phone:null},
];

test("client labels prioritize saved name, and missing names receive an explicit fallback", () => {
  assert.equal(customerLabel(customers[0]), "João da Silva");
  assert.equal(customerLabel(customers[2]), "Cliente sem nome");
  assert.equal(customerInitials(customers[0]), "JS");
  assert.equal(customerInitials(customers[2]), "?");
});

test("search is accent and case insensitive", () => {
  assert.deepEqual(searchManualCreditCustomers(customers, "JOAO").map(c => c.id), ["1"]);
  assert.deepEqual(searchManualCreditCustomers(customers, "jose").map(c => c.id), ["4"]);
  assert.deepEqual(searchManualCreditCustomers(customers, "maria").map(c => c.id), ["2","5"]);
});

test("phone search ignores punctuation and country prefix", () => {
  assert.deepEqual(searchManualCreditCustomers(customers, "98888").map(c => c.id), ["1"]);
  assert.deepEqual(searchManualCreditCustomers(customers, "97777").map(c => c.id), ["2"]);
  assert.equal(formatCustomerPhone(customers[0].phone), "(11) 98888-7777");
  assert.equal(formatCustomerPhone(customers[1].phone), "(11) 97777-6666");
  assert.equal(formatCustomerPhone(customers[3].phone), "(11) 3333-4444");
  assert.equal(formatCustomerPhone(null), "Telefone não informado");
});

test("search is bounded and ignores unknown recent customer ids", () => {
  assert.equal(searchManualCreditCustomers(customers, "", 2).length, 2);
  assert.deepEqual(recentManualCreditCustomers(customers, ["missing", "2", "1"]).map(c => c.id), ["2","1"]);
});

test("recent list stores only ids, is unique and favors the latest credited client", () => {
  assert.deepEqual(rememberManualCreditCustomer(["a","b","c"], "b"), ["b","a","c"]);
  assert.deepEqual(rememberManualCreditCustomer(["a","b","c","d","e"], "f"), ["f","a","b","c","d"]);
});

test("manual credit customer selector remains tenant-scoped and only writes through credit RPC", () => {
  const source = fs.readFileSync(path.join(root,"src/features/loyalty/ManualLoyaltyCredit.tsx"),"utf8");
  assert.match(source,/"customers", "id,name,phone"/);
  assert.match(source,/\.eq\("restaurant_id", restaurant\.id\)/);
  assert.match(source,/\.rpc\("credit_loyalty_points_manual"/);
  assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  assert.match(source,/aria-pressed=\{selected\}/);
  assert.match(source,/localStorage\.setItem\(recentStorageKey\(restaurantId\)/);
  assert.match(source,/same request id|SAME request id/i);
});
