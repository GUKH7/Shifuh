import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");

test("histórico usa a largura padrão do painel", () => {
  assert.match(history, /className="admin-page-shell"/);
  assert.doesNotMatch(history, /mx-auto max-w-6xl/);
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
  assert.match(history, /itemsText\.includes\(term\)/);
  assert.match(history, /getItemsExportText\(order\)/);
  assert.match(history, /Buscar pedido, cliente, telefone, pagamento ou produto/);
});
