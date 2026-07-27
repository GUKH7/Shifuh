const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const enhancer = fs.readFileSync("src/app/admin/(painel)/DashboardTopProductsEnhancer.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard ativa o ajuste dos rótulos de produtos", () => {
  assert.match(page, /DashboardTopProductsEnhancer/);
  assert.match(enhancer, /MAX_PRODUCT_LABEL_LENGTH = 20/);
  assert.match(enhancer, /abbreviateProductLabel/);
  assert.match(enhancer, /dataset\.fullProductLabel/);
  assert.match(enhancer, /replaceChildren\(document\.createTextNode\(shortLabel\)\)/);
});

test("nomes completos continuam disponíveis para acessibilidade e tooltip", () => {
  assert.match(enhancer, /setAttribute\("aria-label", fullLabel\)/);
  assert.match(enhancer, /MutationObserver/);
  assert.match(enhancer, /recharts-yAxis \.recharts-cartesian-axis-tick-value/);
});

test("tooltip pode escapar do card sem ser cortado", () => {
  assert.match(styles, /overflow: visible;/);
  assert.match(styles, /z-index: 50 !important;/);
  assert.match(styles, /recharts-tooltip-wrapper/);
  assert.match(styles, /recharts-surface/);
  assert.match(styles, /white-space: normal !important;/);
});
