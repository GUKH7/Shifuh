const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync("src/app/admin/(painel)/page.tsx", "utf8");
const enhancer = fs.readFileSync("src/app/admin/(painel)/DashboardTopProductsEnhancer.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");
const mobileStyles = fs.readFileSync("src/app/admin/(painel)/dashboard-top-products-mobile.module.css", "utf8");

test("dashboard ativa o ajuste responsivo dos rótulos de produtos", () => {
  assert.match(page, /DashboardTopProductsEnhancer/);
  assert.match(page, /dashboard-top-products-mobile\.module\.css/);
  assert.match(enhancer, /DESKTOP_PRODUCT_LABEL_LENGTH = 20/);
  assert.match(enhancer, /MOBILE_PRODUCT_LABEL_LENGTH = 16/);
  assert.match(enhancer, /MOBILE_BREAKPOINT = 639/);
  assert.match(enhancer, /getProductLabelLimit/);
  assert.match(enhancer, /abbreviateProductLabel/);
  assert.match(enhancer, /dataset\.fullProductLabel/);
  assert.match(enhancer, /replaceChildren\(document\.createTextNode\(shortLabel\)\)/);
});

test("nomes ficam em uma linha no mobile e completos no tooltip", () => {
  assert.match(enhancer, /setAttribute\("aria-label", fullLabel\)/);
  assert.match(enhancer, /setAttribute\("xml:space", "preserve"\)/);
  assert.match(enhancer, /labelNode\.style\.whiteSpace = "pre"/);
  assert.match(enhancer, /MutationObserver/);
  assert.match(enhancer, /ResizeObserver/);
  assert.match(enhancer, /orientationchange/);
  assert.match(mobileStyles, /tspan:not\(:first-child\)/);
  assert.match(mobileStyles, /white-space: pre/);
});

test("tooltip pode escapar do card sem ser cortado", () => {
  assert.match(styles, /overflow: visible;/);
  assert.match(styles, /z-index: 50 !important;/);
  assert.match(styles, /recharts-tooltip-wrapper/);
  assert.match(styles, /recharts-surface/);
  assert.match(styles, /white-space: normal !important;/);
  assert.match(mobileStyles, /max-width: calc\(100vw - 2rem\)/);
});
