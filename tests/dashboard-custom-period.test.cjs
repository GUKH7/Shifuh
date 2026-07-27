const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard oferece período personalizado com datas inicial e final", () => {
  assert.match(dashboard, /type DashboardPeriod = [^;]*"custom"/);
  assert.match(dashboard, /Período personalizado/);
  assert.match(dashboard, /period === "custom"/);
  assert.match(dashboard, /id="dashboard-custom-start"/);
  assert.match(dashboard, /id="dashboard-custom-end"/);
  assert.match(dashboard, /type="date"/);
  assert.match(dashboard, /Comparação automática com o período anterior de mesma duração/);
});

test("período personalizado recalcula comparação e série do gráfico", () => {
  assert.match(dashboard, /comparisonLabel: "vs\. período anterior"/);
  assert.match(dashboard, /previousStart = startOfDay\(addDays\(normalizedStart, -days\)\)/);
  assert.match(dashboard, /buildRevenueSeries\(validPeriodOrders, period, range\)/);
  assert.match(dashboard, /\[orders, period, customStart, customEnd\]/);
});

test("seletores visuais não dependem da posição do painel personalizado", () => {
  assert.match(styles, /section\[class\*="xl:grid-cols-5"\]/);
  assert.match(styles, /section\[class\*="xl:grid-cols-12"\]:has\(> article:nth-child\(3\)\)/);
  assert.doesNotMatch(styles, /section:nth-of-type\(2\)/);
});
