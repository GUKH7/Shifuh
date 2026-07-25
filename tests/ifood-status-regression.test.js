const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const syncSource = fs.readFileSync("src/lib/ifood/order-sync.ts", "utf8");
const resilienceSource = fs.readFileSync("src/lib/ifood/order-sync-resilience.ts", "utf8");

test("sincronização usa proteção contra regressão de status", () => {
  assert.match(syncSource, /shouldApplyIfoodStatus/);
  assert.match(syncSource, /statusApplied/);
  assert.match(syncSource, /ignoredStatusEvent/);
  assert.match(syncSource, /lastAppliedIfoodEvent/);
});

test("estados terminais permanecem protegidos", () => {
  assert.match(resilienceSource, /currentStatus === "canceled" \|\| currentStatus === "done"/);
  assert.match(resilienceSource, /nextStatus === currentStatus/);
  assert.match(resilienceSource, /nextStatus === "canceled"/);
});
