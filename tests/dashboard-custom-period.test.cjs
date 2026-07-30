const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard oferece período personalizado com calendário compartilhado", () => {
  assert.match(dashboard, /type DashboardPeriod = [^;]*"custom"/);
  assert.match(dashboard, /Período personalizado/);
  assert.match(dashboard, /period === "custom"/);
  assert.match(dashboard, /<AdminDatePicker/);
  assert.match(dashboard, /Comparação automática com o período anterior de mesma duração/);
});

test("período personalizado recalcula comparação e série do gráfico", () => {
  assert.match(dashboard, /comparisonLabel: "vs\. período anterior"/);
  assert.match(dashboard, /previousStart = startOfDay\(addDays\(normalizedStart, -days\)\)/);
  assert.match(dashboard, /buildRevenueSeries\(validPeriodOrders, period, range\)/);
  assert.match(dashboard, /\[orders, period, customStart, customEnd\]/);
});

test("dashboard usa classes semânticas em vez de seletores estruturais", () => {
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(dashboard, /dashboard-metrics-grid/);
  assert.match(dashboard, /dashboard-analytics-grid/);
  assert.match(styles, /dashboard-top-products-card/);
  assert.doesNotMatch(styles, /:has|nth-child|first-child|\[class\*=/);
});
