const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const enhancer = fs.readFileSync("src/app/admin/(painel)/DashboardTopProductsEnhancer.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("dashboard cria uma coluna própria para os nomes dos produtos", () => {
  assert.match(page, /DashboardTopProductsEnhancer/);
  assert.match(enhancer, /DESKTOP_PRODUCT_LABEL_LENGTH = 20/);
  assert.match(enhancer, /MOBILE_PRODUCT_LABEL_LENGTH = 16/);
  assert.match(enhancer, /getProductLabelLimit/);
  assert.match(enhancer, /abbreviateProductLabel/);
  assert.match(enhancer, /top-products-label-overlay/);
  assert.match(enhancer, /top-products-label/);
  assert.match(enhancer, /createLabelOverlay/);
  assert.match(enhancer, /host\.classList\.add\("top-products-chart-host"\)/);
  assert.match(enhancer, /card\.dataset\.topProductsCard = "true"/);
});

test("localiza os textos reais do SVG mesmo quando classes internas do Recharts mudam", () => {
  assert.match(enhancer, /\.recharts-responsive-container svg text/);
  assert.match(enhancer, /getBoundingClientRect/);
  assert.match(enhancer, /rect\.left < leftLimit/);
  assert.match(enhancer, /slice\(0, 5\)/);
  assert.doesNotMatch(enhancer, /recharts-cartesian-axis-tick-value/);
});

test("nomes ficam em uma linha e preservam o texto completo", () => {
  assert.match(enhancer, /label\.textContent = abbreviateProductLabel\(fullLabel\)/);
  assert.match(enhancer, /label\.title = fullLabel/);
  assert.match(enhancer, /aria-label/);
  assert.match(enhancer, /tickNode\.style\.opacity = "0"/);
  assert.match(enhancer, /tickNode\.style\.visibility = "hidden"/);
  assert.match(enhancer, /MutationObserver/);
  assert.match(enhancer, /ResizeObserver/);
  assert.match(enhancer, /orientationchange/);
  assert.match(styles, /text-overflow: ellipsis/);
  assert.match(styles, /white-space: nowrap/);
});

test("tooltip pode escapar do card sem ser cortado", () => {
  assert.match(styles, /overflow: visible/);
  assert.match(styles, /z-index: 50 !important/);
  assert.match(styles, /recharts-tooltip-wrapper/);
  assert.match(styles, /recharts-surface/);
  assert.match(styles, /white-space: normal !important/);
  assert.match(styles, /max-width: min\(280px, calc\(100vw - 2rem\)\)/);
});
