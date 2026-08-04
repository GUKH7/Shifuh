const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const dashboardStyles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");
const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const history = fs.readFileSync("src/app/admin/(painel)/history/page.tsx", "utf8");
const menu = fs.readFileSync("src/app/admin/(painel)/menu/page.tsx", "utf8");

test("dashboard mantém cinco indicadores e cards analíticos sem seletores frágeis", () => {
  assert.match(dashboard, /dashboard-metrics-grid/);
  assert.match(dashboard, /dashboard-top-products-card/);
  assert.match(dashboard, /Produtos mais pedidos/);
  assert.doesNotMatch(dashboardStyles, /:has|nth-child|first-child|\[class\*=/);
});

test("pedidos mantém pagamento em uma linha e status real da loja", () => {
  assert.match(orders, /<span>Pagamento<\/span>/);
  assert.match(orders, /getStoreStatus\(restaurantConfig\?\.work_hours, storeClock\)/);
});

test("histórico mantém linhas expansíveis e status operacionais", () => {
  assert.match(history, /<details key=\{order\.id\}/);
  assert.match(history, /<OrderStatusBadge/);
});

test("cardápios mantém busca e ações responsivas", () => {
  assert.match(menu, /Buscar item ou categoria/);
  assert.match(menu, /Importar do iFood/);
  assert.match(menu, /Categoria/);
  assert.match(menu, /Produto/);
});
