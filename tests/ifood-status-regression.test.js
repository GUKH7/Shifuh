const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/20260725170000_guard_ifood_order_status_regression.sql",
  "utf8",
);

test("trigger protege pedidos iFood contra regressão", () => {
  assert.match(migration, /guard_ifood_order_status_regression/);
  assert.match(migration, /old\.external_source is distinct from 'ifood'/);
  assert.match(migration, /new_rank < old_rank/);
  assert.match(migration, /new\.status := old\.status/);
});

test("estados terminais não podem ser reabertos", () => {
  assert.match(migration, /old\.status in \('done', 'canceled'\)/);
  assert.match(migration, /terminal_status_protected/);
});

test("tentativa ignorada fica auditável no payload", () => {
  assert.match(migration, /ignoredStatusEvent/);
  assert.match(migration, /previousStatus/);
  assert.match(migration, /attemptedStatus/);
  assert.match(migration, /status_regression_prevented/);
  assert.match(migration, /lastAppliedStatus/);
});
