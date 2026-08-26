const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const storefrontStyles = fs.readFileSync("src/app/[slug]/layout.module.css", "utf8");
const storefrontPage = fs.readFileSync("src/features/storefront/StorefrontPage.tsx", "utf8");

test("carrossel de banners aplica transição horizontal ao trocar imagem", () => {
  assert.match(storefrontPage, /key=\{currentBannerUrl\}/);
  assert.match(storefrontStyles, /@keyframes storefrontBannerSlideIn/);
  assert.match(storefrontStyles, /translate3d\(14%, 0, 0\)/);
  assert.match(storefrontStyles, /460ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
});

test("transição do banner respeita preferência por movimento reduzido", () => {
  assert.match(storefrontStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(storefrontStyles, /animation: none !important/);
});
