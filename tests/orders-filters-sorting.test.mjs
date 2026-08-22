import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("src/app/admin/(painel)/orders/OrdersWorkspace.tsx", "utf8");
const layout = fs.readFileSync("src/app/admin/(painel)/orders/layout.tsx", "utf8");

test("workspace alternativo mantém data funcional e filtros padronizados", () => {
  assert.match(workspace, /type="date" value=\{selectedDate\}/);
  assert.match(workspace, /toLocalDateKey\(order\.created_at\) === selectedDate/);
  assert.match(workspace, /channelFilter === "all" \|\| getChannel\(order\) === channelFilter/);
  assert.match(workspace, /fulfillmentFilter === "all" \|\| getFulfillment\(order\) === fulfillmentFilter/);
  assert.match(workspace, /paymentFilter === "all" \|\| getPaymentCategory\(order\) === paymentFilter/);
  assert.match(workspace, /<AdminSelect className="mt-2" value=\{activeStatus\}/);
});

test("workspace alternativo mantém ordenação padronizada nas colunas", () => {
  const headers = workspace.match(/<SortableTableHeader/g) || [];
  assert.equal(headers.length, 8);
  assert.match(workspace, /toggleSort\("order"\)/);
  assert.match(workspace, /toggleSort\("customer"\)/);
  assert.match(workspace, /toggleSort\("channel"\)/);
  assert.match(workspace, /toggleSort\("items"\)/);
  assert.match(workspace, /toggleSort\("value"\)/);
  assert.match(workspace, /toggleSort\("payment"\)/);
  assert.match(workspace, /toggleSort\("status"\)/);
  assert.match(workspace, /toggleSort\("time"\)/);
});

test("workspace alternativo mantém resumo sem sobreposição no mobile", () => {
  assert.match(workspace, /surface-card w-full rounded-\[24px\]/);
  assert.doesNotMatch(workspace, /fixed bottom-/);
  assert.match(workspace, /Resumo do dia/);
});

test("layout de pedidos preserva a página e o status do WhatsApp", () => {
  assert.match(layout, /\{children\}/);
  assert.match(layout, /<OrdersWhatsappStatus \/>/);
  assert.doesNotMatch(layout, /OrdersWorkspace/);
});
