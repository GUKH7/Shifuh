import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync(
  "src/app/admin/(painel)/history/HistoryWorkspace.tsx",
  "utf8",
);
const layout = fs.readFileSync("src/app/admin/(painel)/history/layout.tsx", "utf8");

test("histórico usa workspace renovado e componentes administrativos padronizados", () => {
  assert.match(layout, /HistoryWorkspace/);
  assert.match(workspace, /AdminPageShell/);
  assert.match(workspace, /AdminPageHeader/);
  assert.match(workspace, /AdminInput/);
  assert.match(workspace, /AdminSelect/);
});

test("histórico permite recolher grupos completos por data", () => {
  assert.match(workspace, /collapsedDates/);
  assert.match(workspace, /toggleDateGroup/);
  assert.match(workspace, /toggleAllGroups/);
  assert.match(workspace, /aria-expanded=\{!isCollapsed\}/);
  assert.match(workspace, /Recolher datas/);
  assert.match(workspace, /Expandir datas/);
});

test("histórico oferece ordenação crescente e decrescente nas colunas", () => {
  assert.match(workspace, /type SortKey/);
  assert.match(workspace, /sortDirection/);
  assert.match(workspace, /toggleSort/);
  assert.equal((workspace.match(/<SortableTableHeader/g) || []).length, 6);
  assert.match(workspace, /Data e horário/);
  assert.match(workspace, /Número do pedido/);
  assert.match(workspace, /Pagamento/);
});

test("histórico mantém indicadores de status e detalhes expansíveis", () => {
  assert.match(workspace, /<OrderStatusBadge status=\{order\.status\}/);
  assert.match(workspace, /<details key=\{order\.id\}/);
  assert.match(workspace, /Copiar ID/);
  assert.match(workspace, /WhatsApp/);
});
