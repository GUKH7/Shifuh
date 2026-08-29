const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho mobile preserva mais área visual do carrossel", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /aspect-ratio:\s*32 \/ 15/);
  assert.match(storefrontLayout, /margin:\s*-14px 14px 0 !important/);
  assert.match(storefrontLayout, /border-radius:\s*26px !important/);
  assert.match(storefrontLayout, /background:\s*#ffffff !important/);
  assert.match(storefrontLayout, /box-shadow:\s*0 8px 22px rgba\(17, 16, 15, 0\.07\) !important/);
});

test("identidade da loja fica centralizada com logo mais discreta", () => {
  assert.match(storefrontLayout, /flex-direction:\s*column !important/);
  assert.match(storefrontLayout, /align-items:\s*center !important/);
  assert.match(storefrontLayout, /position:\s*absolute !important/);
  assert.match(storefrontLayout, /top:\s*-34px !important/);
  assert.match(storefrontLayout, /left:\s*50% !important/);
  assert.match(storefrontLayout, /width:\s*68px !important/);
  assert.match(storefrontLayout, /height:\s*68px !important/);
  assert.match(storefrontLayout, /transform:\s*translateX\(-50%\) !important/);
});

test("nome e resumo principal ficam mais compactos", () => {
  assert.match(storefrontLayout, /font-size:\s*20px !important/);
  assert.match(storefrontLayout, /line-height:\s*1\.14 !important/);
  assert.match(storefrontLayout, /font-size:\s*11\.5px !important/);
  assert.match(storefrontLayout, /margin-top:\s*2px !important/);
  assert.match(storefrontLayout, /padding:\s*4px 8px !important/);
});

test("metadados e informações da loja usam menos altura", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*margin-top:\s*8px !important/);
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*padding:\s*8px 0 0 !important/);
  assert.match(storefrontLayout, /> details[\s\S]*margin-top:\s*6px !important/);
  assert.match(storefrontLayout, /> details > summary[\s\S]*padding:\s*8px 0 2px !important/);
});

test("acesso à conta fica mais discreto sem perder usabilidade", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*40px !important/);
  assert.match(storefrontLayout, /height:\s*40px !important/);
  assert.match(storefrontLayout, /background:\s*#f4f5f6 !important/);
  assert.match(storefrontLayout, /width:\s*16px !important/);
});

test("cta do carrossel ganha contraste e indicadores ficam mais baixos", () => {
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*bottom:\s*42px !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*background:\s*rgba\(255, 255, 255, 0\.94\) !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*color:\s*#2f343a !important/);
  assert.match(storefrontLayout, /button\[aria-label\^="Exibir banner "\][\s\S]*bottom:\s*18px !important/);
  assert.match(storefrontLayout, /class~="pointer-events-none"[\s\S]*bottom:\s*16px !important/);
});

test("cabeçalho permanece próximo da navegação do cardápio", () => {
  assert.match(storefrontLayout, /padding-bottom:\s*6px !important/);
  assert.match(storefrontLayout, /\[data-catalog-nav\] > div[\s\S]*padding-top:\s*3px !important/);
});
