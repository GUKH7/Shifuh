const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("arquivos da sincronização resiliente do iFood estão presentes", () => {
  const requiredFiles = [
    "src/lib/ifood/order-sync-resilience.ts",
    "src/app/api/cron/ifood/orders/route.ts",
    "src/app/api/integrations/ifood/orders/sync/route.ts",
    "supabase/migrations/20260725150000_harden_ifood_order_event_queue.sql",
    "tests/fixtures/ifood-order-events.json",
  ];

  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(file), true, `${file} deve existir`);
  }
});

test("fixture simulada possui eventos válidos e duplicidade controlada", () => {
  const fixture = JSON.parse(
    fs.readFileSync("tests/fixtures/ifood-order-events.json", "utf8"),
  );
  assert.equal(Array.isArray(fixture), true);
  assert.equal(fixture.length, 4);
  assert.equal(fixture.filter((event) => event.id === "evt-confirmed-late").length, 2);
});
