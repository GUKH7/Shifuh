import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync("src/app/admin/(painel)/layout.tsx", "utf8");
const sidebar = fs.readFileSync("src/components/admin-sidebar.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");
const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");

test("painel usa Dashboard como nome padronizado", () => {
  assert.match(layout, /label: "Dashboard"/);
  assert.match(sidebar, /name: "Dashboard"/);
  assert.match(dashboard, /title="Dashboard"/);
  assert.doesNotMatch(dashboard, /Painel operacional/);
});

test("controles administrativos usam foco laranja e selects padronizados", () => {
  assert.match(responsive, /admin-control:focus-visible/);
  assert.match(responsive, /border-color: var\(--brand\)/);
  assert.match(responsive, /admin-select/);
  assert.match(responsive, /padding-right: 2\.75rem/);
});

test("componentes reutilizáveis cobrem páginas, controles, botões, skeleton e ordenação", () => {
  for (const component of [
    "AdminPageShell",
    "AdminPageHeader",
    "AdminInput",
    "AdminSelect",
    "AdminButton",
    "AdminSkeleton",
    "SortableTableHeader",
  ]) {
    assert.match(primitives, new RegExp(`export (?:const|function|type) ${component}`));
  }
});

test("dashboard usa largura de pedidos e visão operacional completa", () => {
  assert.match(responsive, /max-width: 1460px/);
  assert.match(dashboard, /Faturamento \(hoje\)/);
  assert.match(dashboard, /Pedidos \(hoje\)/);
  assert.match(dashboard, /Produtos mais pedidos/);
  assert.match(dashboard, /Fontes de pedidos/);
  assert.match(dashboard, /Atividade diária/);
  assert.match(dashboard, /Pedidos recentes/);
  assert.match(dashboard, /<AreaChart/);
  assert.match(dashboard, /<PieChart>/);
  assert.match(dashboard, /<BarChart/);
});

test("sidebar deixa ícones pretos no hover", () => {
  assert.match(sidebar, /group-hover:text-gray-950/);
});
