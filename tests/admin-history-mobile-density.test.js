const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const history = fs.readFileSync(
  path.join(root, "src", "app", "admin", "(painel)", "history", "page.tsx"),
  "utf8",
);

test("histórico recolhe filtros secundários em todos os breakpoints", () => {
  assert.match(history, /isMobileFiltersOpen/);
  assert.match(history, /aria-expanded=\{isMobileFiltersOpen\}/);
  assert.match(history, />Filtros<\/span>/);
  assert.match(history, /<select[\s\S]*value=\{filter\}/);
  assert.match(history, /<select[\s\S]*value=\{period\}/);
  assert.doesNotMatch(history, /hidden flex-wrap gap-2 md:flex/);
});

test("pedidos usam resumo compacto e detalhes expansíveis no mobile e desktop", () => {
  assert.match(history, /grid grid-cols-2 divide-x/);
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /Ver detalhes/);
  assert.match(history, /group-open:rotate-180/);
  assert.match(
    history,
    /lg:grid-cols-\[minmax\(180px,0\.85fr\)_minmax\(190px,1fr\)_auto_auto\]/,
  );
  assert.doesNotMatch(history, /grid-cols-\[88px_1\.1fr_1fr/);
});

test("exportação ocupa apenas um botão compacto no celular", () => {
  assert.match(history, /aria-label="Exportar histórico"/);
  assert.match(history, /h-11 w-11[\s\S]*sm:w-auto/);
  assert.match(history, /<span className="hidden sm:inline">Exportar<\/span>/);
});
