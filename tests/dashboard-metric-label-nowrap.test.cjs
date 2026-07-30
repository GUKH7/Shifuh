const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("títulos dos cards de métricas não quebram em duas linhas", () => {
  assert.match(dashboard, /dashboard-metric-card-label/);
  assert.match(styles, /dashboard-metric-card-label[\s\S]*white-space: nowrap/);
  assert.doesNotMatch(styles, /\[class\*=/);
});
