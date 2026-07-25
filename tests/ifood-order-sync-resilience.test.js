const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const resilience = fs.readFileSync("src/lib/ifood/order-sync-resilience.ts", "utf8");
const orderSync = fs.readFileSync("src/lib/ifood/order-sync.ts", "utf8");
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

test("fila resiliente serializa por restaurante e repete somente falhas transitórias", () => {
  assert.match(resilience, /runningSyncs = new Map/);
  assert.match(resilience, /isTransientIfoodSyncError/);
  assert.match(resilience, /status === 429/);
  assert.match(resilience, /status >= 500/);
  assert.match(resilience, /BASE_DELAY_MS \* 2 \*\*/);
  assert.match(manualRoute, /syncIfoodOrdersWithResilience/);
  assert.match(cronRoute, /syncIfoodOrdersWithResilience/);
});

test("cron isola restaurantes e informa sucesso parcial", () => {
  assert.match(cronRoute, /CRON_CONCURRENCY/);
  assert.match(cronRoute, /Promise\.all/);
  assert.match(cronRoute, /partial_success/);
  assert.match(cronRoute, /integrationsFailed/);
  assert.match(cronRoute, /durationMs/);
});

test("eventos brutos continuam armazenados antes do processamento e ACK", () => {
  const insertPosition = orderSync.indexOf('.from("ifood_order_events").insert');
  const processPosition = orderSync.indexOf("upsertLocalOrderFromIfood");
  const ackPosition = orderSync.lastIndexOf("acknowledgeIfoodOrderEvents");

  assert.ok(insertPosition > 0);
  assert.ok(processPosition > 0);
  assert.ok(ackPosition > insertPosition);
  assert.match(orderSync, /raw_payload: event as unknown as Json/);
  assert.match(orderSync, /processedEventIds/);
  assert.match(orderSync, /alreadyProcessedEventIds/);
});

test("banco possui fila de retentativas e consulta de ACK pendente", () => {
  assert.match(migration, /retry_count integer not null default 0/);
  assert.match(migration, /next_retry_at timestamptz/);
  assert.match(migration, /last_error text/);
  assert.match(migration, /dead_lettered_at timestamptz/);
  assert.match(migration, /idx_ifood_order_events_pending_queue/);
  assert.match(migration, /idx_ifood_order_events_unacknowledged/);
});

test("payload simulado inclui duplicidade, evento fora de ordem e pedido agendado", () => {
  assert.equal(fixture.length, 4);
  assert.equal(fixture.filter((event) => event.id === "evt-confirmed-late").length, 2);
  assert.equal(fixture[0].createdAt > fixture[1].createdAt, true);
  const scheduled = fixture.find((event) => event.id === "evt-scheduled");
  assert.equal(scheduled.metadata.orderTiming, "SCHEDULED");
  assert.ok(scheduled.metadata.schedule.deliveryDateTimeStart);
});

test("transições terminais não regridem por evento antigo", () => {
  assert.match(resilience, /STATUS_RANK/);
  assert.match(resilience, /currentStatus === "canceled" \|\| currentStatus === "done"/);
  assert.match(resilience, /nextStatus === "canceled"/);
  assert.match(resilience, /sortAndDeduplicateIfoodEvents/);
});
