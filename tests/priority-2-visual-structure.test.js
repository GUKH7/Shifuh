const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");
const responsive = read("src/app/admin/(painel)/admin-responsive.css");
const states = read("src/components/ui/admin-page-states.tsx");
const datePicker = read("src/components/ui/admin-date-picker.tsx");
const pages = {
  dashboard: read("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx"),
  orders: read("src/app/admin/(painel)/orders/page.tsx"),
  history: read("src/app/admin/(painel)/history/page.tsx"),
  menu: read("src/app/admin/(painel)/menu/page.tsx"),
  clients: read("src/app/admin/(painel)/clients/ClientsWorkspace.tsx"),
  coupons: read("src/app/admin/(painel)/coupons/CouponsWorkspace.tsx"),
  reviews: read("src/app/admin/(painel)/reviews/ReviewsWorkspace.tsx"),
  settings: read("src/app/admin/(painel)/settings/page.tsx"),
};

test("todas as páginas principais usam shell de 1460px e cabeçalho compartilhado", () => {
  assert.match(responsive, /\.admin-page-shell[\s\S]*max-width:\s*1460px/);
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /AdminPageShell/, name + " sem AdminPageShell");
    assert.match(page, /AdminPageHeader/, name + " sem AdminPageHeader");
    assert.doesNotMatch(page, /max-w-6xl/, name + " ainda limitado a 6xl");
  }
});

test("skeleton erro e vazio possuem componentes compartilhados", () => {
  assert.match(states, /export function AdminPageSkeleton/);
  assert.match(states, /export function AdminErrorState/);
  assert.match(states, /export function AdminEmptyState/);
  for (const name of ["dashboard", "orders", "history", "menu", "clients", "coupons", "reviews", "settings"]) {
    assert.match(pages[name], /AdminPageSkeleton|OrdersSkeleton|AdminSkeleton/, name + " sem skeleton compartilhado");
    assert.match(pages[name], /AdminErrorState/, name + " sem erro compartilhado");
  }
});

test("controles de data permanecem padronizados em pedidos dashboard e histórico", () => {
  assert.match(datePicker, /export function AdminDatePicker/);
  assert.match(pages.dashboard, /<AdminDatePicker/);
  assert.match(pages.orders, /<OrdersDatePicker/);
  assert.match(pages.history, /<AdminInput[\s\S]*type="date"/);
});
