const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");

test("pedidos consultam a data selecionada no banco", () => {
  assert.match(page, /type="date"/);
  assert.match(page, /getSelectedDateRange\(selectedDate\)/);
  assert.match(page, /created_at\.gte\.\$\{start\}/);
  assert.match(page, /scheduled_for\.gte\.\$\{start\}/);
});

test("botão de data abre o calendário nativo de forma explícita", () => {
  assert.match(page, /const dateInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(page, /const openDatePicker = \(\) =>/);
  assert.match(page, /input\.showPicker\(\)/);
  assert.match(page, /onClick=\{openDatePicker\}/);
  assert.match(page, /ref=\{dateInputRef\}/);
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
