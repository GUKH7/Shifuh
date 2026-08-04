const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const resilience = fs.readFileSync("src/lib/ifood/order-sync-resilience.ts", "utf8");
const route = fs.readFileSync(
  "src/app/api/cron/ifood/resilient-orders/route.ts",
  "utf8",
);
const cronResult = fs.readFileSync("src/lib/ifood/cron-result.ts", "utf8");
const worker = fs.readFileSync("scripts/ifood-polling-worker.mjs", "utf8");

test("fila persistente agenda retentativas e envia eventos excedidos para dead letter", () => {
  assert.match(resilience, /MAX_EVENT_RETRIES = 6/);
  assert.match(resilience, /calculateNextEventRetry/);
  assert.match(resilience, /retry_count: nextRetryCount/);
  assert.match(resilience, /dead_lettered_at: nowIso/);
  assert.match(resilience, /next_retry_at/);
  assert.match(resilience, /last_error/);
});

test("ACKs pendentes são recuperados em lotes e registrados no banco", () => {
  assert.match(resilience, /recoverPendingAcknowledgements/);
  assert.match(resilience, /ACK_BATCH_SIZE = 100/);
  assert.match(resilience, /acknowledgeIfoodOrderEvents\(ids\)/);
  assert.match(resilience, /acknowledged_at: acknowledgedAt/);
});

test("cron resiliente isola restaurantes e limita concorrência", () => {
  assert.match(route, /CONCURRENCY = 2/);
  assert.match(route, /Promise\.all/);
  assert.match(route, /syncIfoodOrdersWithResilience/);
  assert.match(route, /summarizeIfoodCronResults/);
  assert.match(route, /\{ status: httpStatus \}/);
  assert.match(cronResult, /partial_success/);
  assert.match(cronResult, /integrationsFailed/);
});

test("worker usa o endpoint resiliente por padrão", () => {
  assert.match(worker, /\/api\/cron\/ifood\/resilient-orders/);
  assert.match(worker, /IFOOD_POLLING_ENDPOINT/);
  assert.match(worker, /IFOOD_POLLING_MAX_INTERVAL_MS/);
  assert.match(worker, /consecutiveFailures/);
  assert.match(worker, /setTimeout\(runAndSchedule, delayMs\)/);
  assert.doesNotMatch(worker, /setInterval\(pollIfoodOrders/);
});
