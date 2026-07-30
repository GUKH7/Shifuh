const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("container do período usa classe semântica e permanece acima dos gráficos ao focar", () => {
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(styles, /dashboard-period-control:focus-within/);
  assert.match(styles, /z-index: 120/);
  assert.doesNotMatch(styles, /button\[aria-expanded="true"\]|:has/);
});
