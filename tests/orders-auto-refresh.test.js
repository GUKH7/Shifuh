const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");

test("cliente Supabase permanece estável durante renderizações", () => {
  assert.match(page, /useMemo, useRef, useState/);
  assert.match(page, /const supabase = useMemo\(/);
  assert.match(page, /createBrowserClient\(/);
  assert.match(page, /const lastSeenOrderIdRef = useRef\(""\)/);
  assert.doesNotMatch(page, /setLastSeenOrderId/);
});

test("pedidos têm atualização de contingência e ao recuperar foco", () => {
  assert.match(page, /window\.setInterval\(refreshOrders, 12000\)/);
  assert.match(page, /window\.addEventListener\("focus", refreshOrders\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(page, /void fetchOrders\(false\)/);
});
