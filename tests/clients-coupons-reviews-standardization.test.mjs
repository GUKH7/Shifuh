import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const clients = fs.readFileSync(
  "src/app/admin/(painel)/clients/ClientsWorkspace.tsx",
  "utf8",
);
const clientsLayout = fs.readFileSync(
  "src/app/admin/(painel)/clients/layout.tsx",
  "utf8",
);
const coupons = fs.readFileSync(
  "src/app/admin/(painel)/coupons/CouponsWorkspace.tsx",
  "utf8",
);
const couponsLayout = fs.readFileSync(
  "src/app/admin/(painel)/coupons/layout.tsx",
  "utf8",
);
const reviews = fs.readFileSync(
  "src/app/admin/(painel)/reviews/ReviewsWorkspace.tsx",
  "utf8",
);
const reviewsLayout = fs.readFileSync(
  "src/app/admin/(painel)/reviews/layout.tsx",
  "utf8",
);

test("Clientes usa workspace padronizado com busca, paginação e cinco colunas ordenáveis", () => {
  assert.match(clientsLayout, /ClientsWorkspace/);
  assert.match(clients, /AdminPageShell/);
  assert.match(clients, /AdminPageHeader/);
  assert.match(clients, /AdminInput/);
  assert.match(clients, /AdminSelect/);
  assert.equal((clients.match(/<SortableTableHeader/g) || []).length, 5);
  assert.match(clients, /toggleSort\("name"\)/);
  assert.match(clients, /toggleSort\("totalSpent"\)/);
  assert.match(clients, /toggleSort\("lastOrderDate"\)/);
  assert.match(clients, /PAGE_SIZE = 10/);
  assert.match(clients, /xl:hidden/);
});

test("Clientes permite expandir os cinco pedidos mais recentes de cada contato", () => {
  assert.match(clients, /recentOrders: RecentOrder\[\]/);
  assert.match(clients, /client\.recentOrders\.length >= 5/);
  assert.match(clients, /if \(order\.status === "canceled"\) return/);
  assert.match(clients, /id, display_number, customer_name, customer_phone, total, created_at, address, status, payment_method/);
  assert.match(clients, /expandedClientPhone === client\.phone/);
  assert.match(clients, /<RecentOrdersPanel client=\{client\} \/>/);
  assert.match(clients, /Últimos pedidos/);
  assert.match(clients, /<OrderStatusBadge status=\{order\.status\}/);
  assert.match(clients, /formatPaymentMethod\(order\.paymentMethod\)/);
});

test("Cupons ganha busca, filtro por status e oito critérios de ordenação", () => {
  assert.match(couponsLayout, /CouponsWorkspace/);
  assert.match(coupons, /Buscar código do cupom/);
  assert.match(coupons, /Todos os status/);
  assert.match(coupons, /type CouponSortKey/);
  assert.equal((coupons.match(/<SortableTableHeader/g) || []).length, 8);
  assert.match(coupons, /toggleSort\("convertedRevenue"\)/);
  assert.match(coupons, /toggleSort\("storeInvestment"\)/);
  assert.match(coupons, /AdminInput/);
  assert.match(coupons, /AdminSelect/);
  assert.match(coupons, /xl:hidden/);
});

test("Avaliações ganha busca, filtros e cinco colunas ordenáveis", () => {
  assert.match(reviewsLayout, /ReviewsWorkspace/);
  assert.match(reviews, /Buscar cliente, pedido ou comentário/);
  assert.match(reviews, /Todas as notas/);
  assert.match(reviews, /type ReviewSortKey/);
  assert.equal((reviews.match(/<SortableTableHeader/g) || []).length, 5);
  assert.match(reviews, /toggleSort\("customer_name"\)/);
  assert.match(reviews, /toggleSort\("rating"\)/);
  assert.match(reviews, /toggleSort\("comment"\)/);
  assert.match(reviews, /PAGE_SIZE = 12/);
  assert.match(reviews, /xl:hidden/);
});

test("As três páginas preservam visual específico para mobile sem tabelas largas", () => {
  assert.match(clients, /hidden grid-cols-[\s\S]*xl:grid/);
  assert.match(coupons, /hidden grid-cols-[\s\S]*xl:grid/);
  assert.match(reviews, /hidden grid-cols-[\s\S]*xl:grid/);
  assert.match(clients, /p-4 xl:hidden/);
  assert.match(coupons, /p-4 xl:hidden/);
  assert.match(reviews, /p-4 xl:hidden/);
});
