const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const orders = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const ordersResponsive = fs.readFileSync("src/app/admin/(painel)/orders/orders-responsive.css", "utf8");
const dashboard = fs.readFileSync("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx", "utf8");
const storefront = fs.readFileSync("src/app/[slug]/page.tsx", "utf8");
const layout = fs.readFileSync("src/app/admin/(painel)/layout.tsx", "utf8");
const headerActions = fs.readFileSync("src/components/admin-header-actions.tsx", "utf8");

test("pedidos exibem apenas um estado vazio", () => {
  const matches = orders.match(/Não encontrou o pedido que procura\?/g) || [];
  assert.equal(matches.length, 1);
});

test("pedidos usam o horário real da loja", () => {
  assert.match(orders, /getStoreStatus\(restaurantConfig\?\.work_hours, storeClock\)/);
  assert.match(orders, /storeStatus\.tone === "open"/);
  assert.match(orders, /"Loja aberta"/);
  assert.match(orders, /"Loja fechando em breve"/);
  assert.match(orders, /storeStatusClasses/);
});

test("dashboard atualiza por realtime e contingência", () => {
  assert.match(dashboard, /dashboard-orders-\$\{restaurantId\}/);
  assert.match(dashboard, /postgres_changes/);
  assert.match(dashboard, /setInterval\(\(\) => void refreshOrders\(\), 15_000\)/);
  assert.match(dashboard, /visibilitychange/);
  assert.match(dashboard, /window\.addEventListener\("focus"/);
});

test("tabela de pedidos possui estrutura móvel semântica", () => {
  assert.match(orders, /orders-table-row/);
  assert.match(orders, /data-label="Pedido"/);
  assert.match(orders, /data-label="Ações"/);
  assert.match(ordersResponsive, /content: attr\(data-label\)/);
  assert.match(ordersResponsive, /grid-template-columns: repeat\(2/);
});

test("vitrine não chama ausência de configuração de entrega grátis", () => {
  assert.match(storefront, /deliveryTiers\.length === 0/);
  assert.match(storefront, /Taxa a consultar/);
});

test("ações de ajuda e notificações possuem funcionalidade real", () => {
  assert.match(layout, /<AdminHeaderActions \/>/);
  assert.match(headerActions, /aria-label="Ajuda"/);
  assert.match(headerActions, /aria-label="Notificações da operação"/);
  assert.match(headerActions, /HELP_ITEMS/);
  assert.match(headerActions, /admin-header-notifications-\$\{restaurantId\}/);
  assert.match(headerActions, /postgres_changes/);
  assert.match(headerActions, /gestor-delivery:notifications-seen/);
  assert.match(headerActions, /Ver todos os pedidos/);
});
