const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");
const calendar = fs.readFileSync(
  "src/app/admin/(painel)/orders/OrdersDatePicker.tsx",
  "utf8",
);

test("pedidos consultam a data selecionada no banco", () => {
  assert.match(page, /getSelectedDateRange\(selectedDate\)/);
  assert.match(page, /created_at\.gte\.\$\{start\}/);
  assert.match(page, /scheduled_for\.gte\.\$\{start\}/);
});

test("botão de data usa calendário estilizado do sistema", () => {
  assert.match(page, /import \{ OrdersDatePicker \} from "\.\/OrdersDatePicker"/);
  assert.match(page, /<OrdersDatePicker/);
  assert.match(page, /value=\{selectedDate\}/);
  assert.match(page, /onChange=\{setSelectedDate\}/);
  assert.doesNotMatch(page, /showPicker/);
  assert.doesNotMatch(page, /type="date"/);

  assert.match(calendar, /role="dialog"/);
  assert.match(calendar, /Calendário de pedidos/);
  assert.match(calendar, /Mês anterior/);
  assert.match(calendar, /Próximo mês/);
  assert.match(calendar, />Hoje</);
  assert.match(calendar, /bg-\[var\(--brand\)\]/);
  assert.match(calendar, /document\.addEventListener\("pointerdown"/);
  assert.match(calendar, /event\.key === "Escape"/);
});

test("painel de filtros controla canal atendimento e pagamento", () => {
  assert.match(page, /isFiltersOpen/);
  assert.match(page, /channelFilter/);
  assert.match(page, /fulfillmentFilter/);
  assert.match(page, /paymentFilter/);
  assert.match(page, /orders-filters-panel/);
});

test("contagens por status respeitam os filtros avançados", () => {
  assert.match(page, /baseFilteredOrders/);
  assert.match(page, /activeFiltersCount/);
  assert.match(page, /clearAllFilters/);
});
