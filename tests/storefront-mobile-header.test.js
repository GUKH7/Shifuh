const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho mobile preserva o enquadramento original do carrossel", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /aspect-ratio:\s*16 \/ 7/);
  assert.match(storefrontLayout, /object-position:\s*center center !important/);
  assert.match(storefrontLayout, /margin:\s*-10px 14px 0 !important/);
  assert.match(storefrontLayout, /border-radius:\s*24px !important/);
  assert.match(storefrontLayout, /box-shadow:\s*0 6px 18px rgba\(17, 16, 15, 0\.06\) !important/);
});

test("identidade da loja fica centralizada com logo proporcional", () => {
  assert.match(storefrontLayout, /flex-direction:\s*column !important/);
  assert.match(storefrontLayout, /align-items:\s*center !important/);
  assert.match(storefrontLayout, /top:\s*-32px !important/);
  assert.match(storefrontLayout, /left:\s*50% !important/);
  assert.match(storefrontLayout, /width:\s*64px !important/);
  assert.match(storefrontLayout, /height:\s*64px !important/);
  assert.match(storefrontLayout, /transform:\s*translateX\(-50%\) !important/);
});

test("nome e resumo principal mantêm hierarquia sem excesso de altura", () => {
  assert.match(storefrontLayout, /font-size:\s*19px !important/);
  assert.match(storefrontLayout, /line-height:\s*1\.12 !important/);
  assert.match(storefrontLayout, /font-size:\s*11\.25px !important/);
  assert.match(storefrontLayout, /margin-top:\s*1px !important/);
  assert.match(storefrontLayout, /row-gap:\s*2px !important/);
});

test("metadados e informações da loja ficam compactos", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*margin-top:\s*7px !important/);
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*padding:\s*7px 0 0 !important/);
  assert.match(storefrontLayout, /> details[\s\S]*margin-top:\s*5px !important/);
  assert.match(storefrontLayout, /> details > summary[\s\S]*padding:\s*7px 0 2px !important/);
});

test("acesso à conta permanece discreto e utilizável", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*38px !important/);
  assert.match(storefrontLayout, /height:\s*38px !important/);
  assert.match(storefrontLayout, /background:\s*#f5f6f7 !important/);
  assert.match(storefrontLayout, /width:\s*15px !important/);
});

test("cta do carrossel fica mais translúcido sem perder legibilidade", () => {
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*bottom:\s*34px !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*padding:\s*6px 10px !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*background:\s*rgba\(255, 255, 255, 0\.58\) !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.4\) !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*box-shadow:\s*0 2px 8px rgba\(17, 16, 15, 0\.08\) !important/);
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*backdrop-filter:\s*blur\(10px\) saturate\(140%\)/);
  assert.match(storefrontLayout, /button\[aria-label\^="Exibir banner "\][\s\S]*bottom:\s*14px !important/);
});

test("cabeçalho permanece próximo da navegação do cardápio", () => {
  assert.match(storefrontLayout, /padding-bottom:\s*5px !important/);
  assert.match(storefrontLayout, /\[data-catalog-nav\] > div[\s\S]*padding-top:\s*2px !important/);
});
