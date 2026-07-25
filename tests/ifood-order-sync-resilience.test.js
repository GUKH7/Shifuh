const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const resilience = fs.readFileSync("src/lib/ifood/order-sync-resilience.ts", "utf8");
const cronRoute = fs.readFileSync("src/app/api/cron/ifood/orders/route.ts", "utf8");
const manualRoute = fs.readFileSync(
  "src/app/api/integrations/ifood/orders/sync/route.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260725150000_harden_ifood_order_event_queue.sql",
  "utf8",
);
const fixture = JSON.parse(
  fs.readFileSync("tests/fixtures/ifood-order-events.json", "utf8"),
);

test("sincronização usa política resiliente nas rotas manual e automática", () => {
  assert.ok(resilience.includes("syncIfoodOrdersWithResilience"));
  assert.ok(resilience.includes("isTransientIfoodSyncError"));
  assert.ok(resilience.includes("runningSyncs"));
  assert.ok(manualRoute.includes("syncIfoodOrdersWithResilience"));
  assert.ok(cronRoute.includes("syncIfoodOrdersWithResilience"));
});

test("cron monitora falhas parciais e duração por restaurante", () => {
  assert.ok(cronRoute.includes("partial_success"));
  assert.ok(cronRoute.includes("integrationsFailed"));
  assert.ok(cronRoute.includes("durationMs"));
  assert.ok(cronRoute.includes("CRON_CONCURRENCY"));
});

test("migração cria metadados da fila de retentativas", () => {
  for (const field of [
    "retry_count",
    "next_retry_at",
    "last_error",
    "dead_lettered_at",
    "processing_started_at",
  ]) {
    assert.ok(migration.includes(field));
  }
  assert.ok(migration.includes("idx_ifood_order_events_pending_queue"));
  assert.ok(migration.includes("idx_ifood_order_events_unacknowledged"));
});

test("payload simulado cobre duplicidade, desordem e agendamento", () => {
  assert.equal(Array.isArray(fixture), true);
  assert.equal(fixture.filter((event) => event.id === "evt-confirmed-late").length, 2);
  assert.equal(fixture[0].createdAt > fixture[1].createdAt, true);
  const scheduled = fixture.find((event) => event.id === "evt-scheduled");
  assert.equal(scheduled.metadata.orderTiming, "SCHEDULED");
  assert.ok(scheduled.metadata.schedule.deliveryDateTimeStart);
});

test("helpers impedem regressão de status e ordenam eventos", () => {
  assert.ok(resilience.includes("shouldApplyIfoodStatus"));
  assert.ok(resilience.includes("sortAndDeduplicateIfoodEvents"));
  assert.ok(resilience.includes('currentStatus === "canceled"'));
  assert.ok(resilience.includes('currentStatus === "done"'));
});
