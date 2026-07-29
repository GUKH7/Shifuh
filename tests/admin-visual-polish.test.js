const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const dashboardPage = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const dashboardStyles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");
const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");
const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");

test("dashboard segue a referência com cinco indicadores e período global", () => {
  assert.match(dashboard, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(dashboard, /xl:grid-cols-12/);
  assert.match(dashboard, /Período das métricas/);
  assert.match(dashboard, /Faturamento \(\$\{metricSuffix\}\)/);
  assert.match(dashboard, /Pedidos concluídos/);
  assert.match(dashboard, /Pedidos cancelados/);
  assert.match(dashboard, /Fontes de pedidos/);
  assert.match(dashboard, /Pedidos recentes/);
  assert.match(dashboard, /vs\. 7 dias anteriores/);
  assert.match(dashboard, /vs\. 30 dias anteriores/);
  assert.match(dashboard, /vs\. ano anterior/);
});

test("títulos das métricas permanecem em uma linha na grade de cinco cards", () => {
  assert.match(dashboardPage, /dashboard-period\.module\.css/);
  assert.match(dashboardPage, /className=\{styles\.page\}/);
  assert.match(dashboardStyles, /white-space: nowrap/);
  assert.match(dashboardStyles, /min-width: 1280px/);
  assert.match(dashboardStyles, /max-width: 1535px/);
});

test("pedidos mantém pagamento em uma linha e adapta o badge à data e ao horário da loja", () => {
  assert.match(orders, /whitespace-nowrap">Método de pagamento<\/span>/);
  assert.match(orders, /isCurrentDate \? <LiveStatusDot className=\{storeStatusDotClass\} \/> : <CalendarDays size=\{16\} \/>/);
  assert.match(orders, /isCurrentDate \? `Loja \$\{storeStatus\.label\.toLowerCase\(\)\}` : "Consulta histórica"/);
  assert.match(orders, /getStoreStatus\(restaurantConfig\?\.work_hours, storeClock\)/);
});

test("histórico usa linhas expansíveis e mantém a bolinha nos status operacionais", () => {
  assert.doesNotMatch(history, /grid-cols-\[88px_1\.1fr_1fr/);
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /<OrderStatusBadge[\s\S]*status=\{order\.status\}[\s\S]*className="whitespace-nowrap"/);
});

test("cardápios centraliza busca, compacta ações e reduz o raio da prévia interna", () => {
  assert.match(menu, /left-4 top-1\/2 -translate-y-1\/2 text-gray-400/);
  assert.equal((menu.match(/inline-flex h-10 items-center justify-center rounded-2xl/g) || []).length >= 3, true);
  assert.match(menu, /mt-5 overflow-hidden rounded-\[18px\]/);
});
