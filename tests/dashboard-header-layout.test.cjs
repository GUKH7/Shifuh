const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard usa o shell e o cabeçalho compartilhados", () => {
  assert.match(page, /DashboardPeriodWorkspace/);
  assert.match(dashboard, /<AdminPageShell/);
  assert.match(dashboard, /<AdminPageHeader/);
  assert.match(dashboard, /dashboard-store-card/);
});

test("cards do cabeçalho e período usam classes semânticas", () => {
  assert.match(styles, /dashboard-store-card/);
  assert.match(styles, /dashboard-period-control/);
  assert.doesNotMatch(styles, /:has|first-child|last-child|nth-child/);
});
