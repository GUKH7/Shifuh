const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const history = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "history", "page.tsx"),
  "utf8",
);

test("histórico mobile recolhe filtros secundários", () => {
  assert.match(history, /isMobileFiltersOpen/);
  assert.match(history, /aria-expanded=\{isMobileFiltersOpen\}/);
  assert.match(history, />Filtros<\/span>/);
  assert.match(history, /<select[\s\S]*value=\{filter\}/);
  assert.match(history, /<select[\s\S]*value=\{period\}/);
});

test("pedidos mobile exibem resumo compacto e detalhes expansíveis", () => {
  assert.match(history, /grid grid-cols-2 divide-x[\s\S]*md:hidden/);
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /Ver detalhes/);
  assert.match(history, /group-open:rotate-180/);
  assert.match(history, /mt-8 hidden overflow-hidden[\s\S]*md:block/);
});

test("exportação ocupa apenas um botão compacto no celular", () => {
  assert.match(history, /aria-label="Exportar histórico"/);
  assert.match(history, /h-11 w-11[\s\S]*sm:w-auto/);
  assert.match(history, /<span className="hidden sm:inline">Exportar<\/span>/);
});
