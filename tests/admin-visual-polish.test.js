const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");
const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");

test("dashboard alinha ação no topo e usa nome claro para o status da loja", () => {
  assert.match(dashboard, /lg:items-start lg:justify-between/);
  assert.match(dashboard, />Status da loja<\/h3>/);
  assert.doesNotMatch(dashboard, />Pulso da loja<\/h3>/);
});

test("pedidos mantém pagamento em uma linha e pulsa no badge de loja aberta", () => {
  assert.match(orders, /whitespace-nowrap">Método de pagamento<\/span>/);
  assert.match(orders, /<LiveStatusDot \/>\s+Loja aberta/);
});

test("histórico reserva espaço e mantém a bolinha nos status operacionais", () => {
  assert.equal((history.match(/minmax\(118px,0\.9fr\)/g) || []).length, 2);
  assert.match(history, /<OrderStatusBadge status=\{order\.status\} className="whitespace-nowrap" \/>/);
});

test("cardápios centraliza busca, compacta ações e reduz o raio da prévia interna", () => {
  assert.match(menu, /left-4 top-1\/2 -translate-y-1\/2 text-gray-400/);
  assert.equal((menu.match(/inline-flex h-10 items-center justify-center rounded-2xl/g) || []).length >= 3, true);
  assert.match(menu, /mt-5 overflow-hidden rounded-\[18px\]/);
});
