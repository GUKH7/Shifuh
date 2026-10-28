"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
function loadBudget() {
  const file = path.join(root, "src/lib/ifood/cron-budget.ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(code, file); return mod.exports;
}
test("cron budget stops scheduling and aborts before 60-second function cap", async () => {
  const { createIfoodCronBudget, IFOOD_CRON_BUDGET_MS } = loadBudget();
  assert.ok(IFOOD_CRON_BUDGET_MS <= 48_000);
  const budget = createIfoodCronBudget(35, 10);
  assert.equal(budget.canStart(), true);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(budget.signal.aborted, true);
  assert.equal(budget.canStart(), false);
  budget.dispose();
});
test("cron routes forward shared budget signals and do not schedule after deadline", () => {
  for (const suffix of ["orders", "resilient-orders"]) {
    const source = fs.readFileSync(path.join(root, "src/app/api/cron/ifood", suffix, "route.ts"), "utf8");
    assert.match(source, /createIfoodCronBudget\(\)/);
    assert.match(source, /budget\.canStart\(\)/);
    assert.match(source, /signal: budget\.signal/);
    assert.match(source, /budget\.dispose\(\)/);
    assert.match(source, /export const maxDuration = 60/);
  }
});
test("outbound calls and retries obey an abort signal", () => {
  const files = ["src/lib/ifood/orders.ts", "src/lib/ifood/order-sync.ts",
    "src/lib/ifood/merchant.ts", "src/lib/ifood/order-sync-resilience.ts"];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /AbortSignal|signal/);
    assert.match(source, /signal\?\.throwIfAborted|signal\?\.aborted|signal:|signal,/);
  }
  const resilience = fs.readFileSync(path.join(root, files[3]), "utf8");
  assert.match(resilience, /abortFromCaller/);
  assert.match(resilience, /params\.signal\?\.throwIfAborted\(\)/);
  assert.match(resilience, /\.eq\("ack_lease_token", token\)/);
  assert.match(resilience, /\.gt\("ack_lease_until"/);
});
test("legacy ACK persistence errors are not reported as durable confirmations", () => {
  const sync = fs.readFileSync(path.join(root, "src/lib/ifood/order-sync.ts"), "utf8");
  assert.match(sync, /acknowledgementWriteError/);
  assert.match(sync, /if \(acknowledgementWriteError\)/);
  assert.match(sync, /acknowledgedCount = ackEventIds\.length/);
});
test("migration audit exposes missing entries, db-only history and timestamp drift", () => {
  const { auditMigrationHistory } = require("../scripts/audit-migration-history.cjs");
  const output = auditMigrationHistory(
    ["20261024101000_ifood_event_lease_replay.sql",
      "20261025121500_ifood_ack_recovery_leases.sql",
      "20260921193000_shared_addon_groups.sql"],
    [{ version: "20261024203819", name: "ifood_event_lease_replay" },
     { version: "20260921215235", name: "shared_addon_groups" },
     { version: "20260914001528", name: "remove_temporary_phone_otp_delivery_diagnostics" }],
  );
  assert.deepEqual(output.unappliedByName.map((x) => x.name), ["ifood_ack_recovery_leases"]);
  assert.deepEqual(output.databaseOnly.map((x) => x.name),
    ["remove_temporary_phone_otp_delivery_diagnostics"]);
  assert.equal(output.timestampDrift.length, 2);
});

test("SQL abort propagates to in-flight PostgREST fetch (never assumes rollback)", async () => {
  const file = path.join(root, "src/lib/ifood/sql-abort.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(file, module);
  mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file)); mod._compile(compiled,file);
  const ac=new AbortController();
  let observedSignal;
  const query={
    abortSignal(signal) { observedSignal=signal;return this; },
    then(resolve,reject) {
      const rejectOnAbort=()=>reject(observedSignal.reason);
      observedSignal.addEventListener("abort",rejectOnAbort,{once:true});
    }
  };
  const pending=Promise.resolve(mod.exports.withIfoodSqlSignal(query,ac.signal));
  setImmediate(() => ac.abort(new Error("mock SQL deadline")));
  await assert.rejects(pending,/mock SQL deadline/);
  assert.equal(observedSignal,ac.signal);
});
test("merchant write operations keep caller-supplied signal, not a global status-only 12s limit", () => {
  const source=fs.readFileSync(path.join(root,"src/lib/ifood/merchant.ts"),"utf8");
  assert.ok(source.includes("signal: init?.signal"));
  assert.ok(source.includes("merchantId}/status"));
  assert.ok(source.includes("AbortSignal.timeout(12_000)"));
  assert.ok(!source.includes("cache: \"no-store\",\n    signal: init?.signal\n      ?"));
});
