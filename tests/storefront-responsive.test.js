const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const storefrontPath = path.join(__dirname, "..", "src", "features", "storefront", "StorefrontPage.tsx");
const toastPath = path.join(__dirname, "..", "src", "components", "ui", "toast-provider.tsx");

test("storefront keeps stable responsive product semantics without coupling to Tailwind widths", () => {
  const source = fs.readFileSync(storefrontPath, "utf8");

  assert.match(source, /data-category-section/);
  assert.match(source, /data-product-card/);
  assert.match(source, /\[overflow-wrap:anywhere\]/);
  assert.match(source, /<ProductImage[\s\S]{0,300}sizes=/);
  assert.doesNotMatch(source, /object-contain p-1\.5/);
});

test("category navigation scrolls inside the viewport and mobile toasts respect its gutters", () => {
  const storefront = fs.readFileSync(storefrontPath, "utf8");
  const toast = fs.readFileSync(toastPath, "utf8");

  assert.match(storefront, /overflow-x-auto overscroll-x-contain/);
  assert.match(storefront, /max-w-\[75vw\] shrink-0 truncate/);
  assert.match(toast, /left-3 right-3 top-3/);
});

test("category navigation keeps horizontal and vertical scrolling independent", () => {
  const storefront = fs.readFileSync(storefrontPath, "utf8");

  assert.match(storefront, /categoryNavRef\.current/);
  assert.match(storefront, /closest\("\[data-catalog-nav\]"\)/);
  assert.match(storefront, /container\.scrollTo\(\{/);
  assert.match(storefront, /window\.scrollTo\(\{ top: Math\.max\(0, targetTop\)/);
  assert.doesNotMatch(storefront, /cat-\$\{category\.id\}`\)\?\.scrollIntoView/);
});
