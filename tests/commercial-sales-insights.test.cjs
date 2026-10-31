"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "../src/features/commercial-actions/sales-insights.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(compiled, sourcePath);
const {getSalesInsights} = mod.exports;
const now = Date.parse("2026-10-31T12:00:00.000Z");
const day = 86400000;
let sequence = 0;
function order(daysAgo, status = "done", total = 20, is_test = false) {
  return {id: String(++sequence), created_at: new Date(now - daysAgo * day).toISOString(), status, total, is_test};
}
const repeat = (count, daysAgo, status = "done", amount = 20) =>
  Array.from({length:count}, () => order(daysAgo,status,amount));

test("30-day dashboard excludes pending, future, old and canceled orders from revenue", () => {
  const result = getSalesInsights([
    order(1, "done", 32), order(29.9, "done", "8"),
    order(5, "canceled", 100), order(2, "pending", 100),
    order(31, "done", 50), order(61, "done", 999),
    order(-1, "done", 1000), order(1, "done", 999, true),
  ], now);
  assert.equal(result.coverage,"complete");
  assert.equal(result.current.completed,2);
  assert.equal(result.current.canceled,1);
  assert.equal(result.current.revenue,40);
  assert.equal(result.current.averageTicket,20);
  assert.equal(result.previous.completed,1);
  assert.equal(result.previous.revenue,50);
});
test("reliably detects a substantial completed-order decline", () => {
  const result = getSalesInsights([...repeat(8, 40),...repeat(3, 4)], now);
  assert.equal(result.completedChangePercent,-63);
  assert.equal(result.actions.find(a => a.id === "sales-decline")?.priority,"high");
  assert.equal(result.actions.find(a => a.id === "sales-decline")?.href,"/admin/clients");
});
test("warns about cancellations with meaningful sample size", () => {
  const result = getSalesInsights([...repeat(7, 2), ...repeat(3, 2,"canceled")], now);
  assert.equal(result.current.canceledPercent,30);
  assert.equal(result.actions.find(a => a.id === "cancellations")?.href,"/admin/orders");
});
test("ticket drop compares only finalized completed orders", () => {
  const result = getSalesInsights([...repeat(5, 45,"done",100),...repeat(5,2,"done",60)],now);
  assert.equal(result.current.averageTicket,60);
  assert.equal(result.actions.find(a=>a.id==="ticket-decline")?.priority,"medium");
});
test("no recent sales versus earlier sales is not called first sale", () => {
  const result = getSalesInsights(repeat(6, 42),now);
  assert.ok(result.actions.some(a=>a.id==="sales-stalled"));
  assert.ok(!result.actions.some(a=>a.id==="first-sales"));
});
test("missing totals or capped pagination produce no fabricated metrics or trends", () => {
  for(const [orders,complete] of [[repeat(4,2),false],[[order(2,"done",null)],true]]) {
    const result=getSalesInsights(orders,now,complete);
    assert.equal(result.coverage,"incomplete");
    assert.equal(result.current,null);
    assert.equal(result.previous,null);
    assert.deepEqual(result.actions.map(a=>a.id),["sales-coverage"]);
  }
});
test("one-sided new sales never invent a growth percentage from a zero baseline",()=>{
  const result=getSalesInsights(repeat(4, 1),now);
  assert.equal(result.completedChangePercent,null);
  assert.ok(!result.actions.some(a=>a.id==="sales-decline"));
});
test("workspace paginates tenant-scoped order reads without customer PII or mutations",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../src/features/commercial-actions/CommercialActionsWorkspace.tsx"),"utf8");
  assert.match(source,/\.from\("orders"\)/);
  assert.match(source,/\.eq\("restaurant_id", restaurant\.id\)/);
  assert.match(source,/\.select\("id,created_at,status,total,is_test"/);
  assert.match(source,/\.range\(offset, offset \+ pageSize - 1\)/);
  assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  assert.match(source,/grid-cols-2/);
});
