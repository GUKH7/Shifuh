const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const history = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "history", "HistoryWorkspace.tsx"),
  "utf8",
);

test("histórico recolhe filtros secundários em todos os breakpoints", () => {
  assert.match(history, /filtersOpen/);
  assert.match(history, /aria-expanded=\{filtersOpen\}/);
  assert.match(history, /<AdminSelect[^>]*value=\{statusFilter\}/);
  assert.match(history, /<AdminSelect[^>]*value=\{period\}/);
  assert.match(history, /<AdminSelect[^>]*value=\{paymentFilter\}/);
  assert.doesNotMatch(history, /hidden flex-wrap gap-2 md:flex/);
});

test("pedidos usam resumo compacto e detalhes expansíveis no mobile e desktop", () => {
  assert.match(history, /grid grid-cols-2 gap-3 xl:grid-cols-4/);
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /Itens do pedido/);
  assert.match(history, /group-open:rotate-180/);
  assert.match(
    history,
    /xl:grid-cols-\[84px_96px_minmax\(220px,1\.25fr\)_minmax\(132px,0\.75fr\)_minmax\(128px,0\.75fr\)_112px_32px\]/,
  );
  assert.match(history, /grid items-start gap-4 lg:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(300px,0\.8fr\)\]/);
});

test("exportação mantém rótulo visível e largura consistente no celular", () => {
  assert.match(history, /aria-label="Exportar histórico"/);
  assert.match(history, /h-11 w-full px-4 sm:w-auto/);
  assert.match(history, /<span>Exportar<\/span>/);
});

test("datas, totais e detalhes compartilham a mesma grade no desktop", () => {
  const desktopGrid =
    "xl:grid-cols-[84px_96px_minmax(220px,1.25fr)_minmax(132px,0.75fr)_minmax(128px,0.75fr)_112px_32px]";
  const headerGrid = desktopGrid.replace("xl:", "");

  assert.equal(history.split(desktopGrid).length - 1, 2);
  assert.equal(history.split(headerGrid).length - 1, 3);
  assert.match(history, /xl:col-span-5/);
  assert.match(history, /<span className="sr-only">Detalhes<\/span>/);
});

test("corrige capitalização, plural e telefone nos detalhes", () => {
  assert.doesNotMatch(history, /font-black capitalize text-gray-950/);
  assert.match(history, /toLocaleUpperCase\("pt-BR"\)/);
  assert.match(history, /totalItemQuantity === 1 \? "item" : "itens"/);
  assert.doesNotMatch(history, /item\(ns\)/);
  assert.match(history, /formatPhone\(order\.customer_phone\)/);
});
