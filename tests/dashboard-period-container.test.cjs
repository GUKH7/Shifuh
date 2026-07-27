const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const periodSelect = fs.readFileSync("src/components/ui/admin-dashboard-period-select.tsx", "utf8");

test("dashboard usa container próprio no lugar do popup nativo", () => {
  assert.match(primitives, /id === "dashboard-period"/);
  assert.match(primitives, /AdminDashboardPeriodSelect/);
  assert.match(periodSelect, /role="listbox"/);
  assert.match(periodSelect, /aria-haspopup="listbox"/);
  assert.match(periodSelect, /Selecionar período/);
  assert.match(periodSelect, /O Dashboard inteiro será atualizado/);
});

test("container fecha ao clicar fora ou pressionar Escape", () => {
  assert.match(periodSelect, /document\.addEventListener\("pointerdown"/);
  assert.match(periodSelect, /event\.key === "Escape"/);
  assert.match(periodSelect, /setOpen\(false\)/);
});

test("opção selecionada mantém o onChange existente", () => {
  assert.match(periodSelect, /onChange\?\.\(syntheticEvent\)/);
  assert.match(periodSelect, /aria-selected=\{active\}/);
  assert.match(periodSelect, /PERIOD_HELPERS/);
});
