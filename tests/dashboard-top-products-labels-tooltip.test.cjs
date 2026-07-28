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
  assert.match(enhancer, /topProductsLabelOverlay/);
  assert.match(enhancer, /createLabelOverlay/);
  assert.match(enhancer, /tickNode.style.opacity/);
});

test("nomes ficam em uma linha e preservam o texto completo", () => {
  assert.match(enhancer, /label.textContent = shortLabel/);
  assert.match(enhancer, /label.title = fullLabel/);
  assert.match(enhancer, /aria-label/);
  assert.match(enhancer, /textOverflow: "ellipsis"/);
  assert.match(enhancer, /whiteSpace: "nowrap"/);
  assert.match(enhancer, /MutationObserver/);
  assert.match(enhancer, /ResizeObserver/);
  assert.match(enhancer, /orientationchange/);
});

test("tooltip pode escapar do card sem ser cortado", () => {
  assert.match(styles, /overflow: visible;/);
  assert.match(styles, /z-index: 50 !important;/);
  assert.match(styles, /recharts-tooltip-wrapper/);
  assert.match(styles, /recharts-surface/);
  assert.match(styles, /white-space: normal !important;/);
  assert.match(enhancer, /max-width: calc/);
});
