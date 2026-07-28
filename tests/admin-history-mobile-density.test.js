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
  assert.match(history, /<AdminSelect value=\{statusFilter\}/);
  assert.match(history, /<AdminSelect value=\{period\}/);
  assert.match(history, /<AdminSelect value=\{paymentFilter\}/);
  assert.doesNotMatch(history, /hidden flex-wrap gap-2 md:flex/);
});

test("pedidos usam resumo compacto e detalhes expansíveis no mobile e desktop", () => {
  assert.match(history, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /Itens do pedido/);
  assert.match(history, /group-open:rotate-180/);
  assert.match(
    history,
    /lg:grid-cols-\[96px_120px_minmax\(180px,1fr\)_150px_minmax\(160px,0\.8fr\)_120px_70px\]/,
  );
  assert.match(history, /lg:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(300px,0\.8fr\)\]/);
});

test("exportação ocupa apenas um botão compacto no celular", () => {
  assert.match(history, /aria-label="Exportar histórico"/);
  assert.match(history, /h-11 w-11[\s\S]*sm:w-auto/);
  assert.match(history, /<span className="hidden sm:inline">Exportar<\/span>/);
});
