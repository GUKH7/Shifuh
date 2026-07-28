import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const history = fs.readFileSync(
  "src/app/admin/(painel)/history/HistoryWorkspace.tsx",
  "utf8",
);
const layout = fs.readFileSync("src/app/admin/(painel)/layout.tsx", "utf8");

test("pesquisa global e páginas usam o mesmo container de largura", () => {
  assert.match(layout, /admin-page-shell grid h-full grid-cols/);
  assert.match(layout, /admin-panel-content min-w-0 overflow-x-hidden px-3/);
  assert.doesNotMatch(layout, /mx-auto grid min-h-16 max-w-\[1460px\]/);
  assert.match(history, /<AdminPageShell className="space-y-5">/);
});

test("histórico consulta e apresenta os produtos dos pedidos", () => {
  assert.match(history, /order_items \(\*\)/);
  assert.match(history, /type HistoryOrderItem/);
  assert.match(history, /Itens do pedido/);
  assert.match(history, /getItemName\(item\)/);
  assert.match(history, /Adicionais:/);
  assert.match(history, /Observação:/);
});

test("busca e exportação também consideram os produtos", () => {
  assert.match(history, /productText\.includes\(term\)/);
  assert.match(history, /getItemsText\(order\)/);
  assert.match(history, /Buscar pedido, cliente, telefone, pagamento ou produto/);
  assert.match(history, /"Produtos"/);
});
