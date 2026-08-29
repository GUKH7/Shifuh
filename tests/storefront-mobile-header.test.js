const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho mobile usa card sobreposto ao carrossel", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /margin:\s*-56px 14px 0 !important/);
  assert.match(storefrontLayout, /border-radius:\s*28px !important/);
  assert.match(storefrontLayout, /background:\s*#ffffff !important/);
  assert.match(storefrontLayout, /box-shadow:\s*0 10px 28px rgba\(17, 16, 15, 0\.08\) !important/);
});

test("identidade da loja fica centralizada e a logo cruza a borda do card", () => {
  assert.match(storefrontLayout, /flex-direction:\s*column !important/);
  assert.match(storefrontLayout, /align-items:\s*center !important/);
  assert.match(storefrontLayout, /position:\s*absolute !important/);
  assert.match(storefrontLayout, /top:\s*-42px !important/);
  assert.match(storefrontLayout, /left:\s*50% !important/);
  assert.match(storefrontLayout, /width:\s*84px !important/);
  assert.match(storefrontLayout, /height:\s*84px !important/);
  assert.match(storefrontLayout, /transform:\s*translateX\(-50%\) !important/);
});

test("nome da loja fica centralizado e mais destacado", () => {
  assert.match(storefrontLayout, /font-size:\s*21px !important/);
  assert.match(storefrontLayout, /font-weight:\s*800 !important/);
  assert.match(storefrontLayout, /text-align:\s*center !important/);
  assert.match(storefrontLayout, /white-space:\s*normal !important/);
  assert.match(storefrontLayout, /text-overflow:\s*clip !important/);
  assert.match(storefrontLayout, /overflow-wrap:\s*anywhere !important/);
});

test("status, prazo e entrega ficam centralizados como contexto principal", () => {
  assert.match(
    storefrontLayout,
    /> div\[class~="flex-1"\] > div\[class~="mt-2"\][\s\S]*justify-content:\s*center !important/,
  );
  assert.match(storefrontLayout, /font-size:\s*12px !important/);
  assert.doesNotMatch(storefrontLayout, /span:nth-child\(4\)[\s\S]*display:\s*none !important/);
});

test("metadados secundários ganham divisão visual sem perder centralização", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*justify-content:\s*center !important/);
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*border-top:\s*1px solid #eceef0 !important/);
  assert.match(storefrontLayout, /> span > svg[\s\S]*width:\s*13px !important/);
  assert.doesNotMatch(storefrontLayout, /> span > svg[\s\S]*display:\s*none !important/);
});

test("acesso à conta permanece na linha do nome com alvo de toque adequado", () => {
  assert.match(storefrontLayout, /div\[class~="sm:hidden"\][\s\S]*position:\s*absolute !important/);
  assert.match(storefrontLayout, /top:\s*0 !important/);
  assert.match(storefrontLayout, /right:\s*0 !important/);
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*44px !important/);
  assert.match(storefrontLayout, /height:\s*44px !important/);
  assert.match(storefrontLayout, /background:\s*#f4f5f6 !important/);
});

test("controles do carrossel continuam visíveis acima do card sobreposto", () => {
  assert.match(storefrontLayout, /\[data-banner-product-link\] ~ span[\s\S]*bottom:\s*72px !important/);
  assert.match(storefrontLayout, /button\[aria-label\^="Exibir banner "\][\s\S]*bottom:\s*56px !important/);
  assert.match(storefrontLayout, /button\[aria-label\^="Exibir banner "\][\s\S]*max-width:\s*48% !important/);
  assert.match(storefrontLayout, /button\[aria-label\^="Exibir banner "\][\s\S]*transform:\s*none !important/);
});

test("cabeçalho continua próximo da navegação do cardápio", () => {
  assert.match(storefrontLayout, /padding-bottom:\s*10px !important/);
  assert.match(storefrontLayout, /\[data-catalog-nav\] > div[\s\S]*padding-top:\s*4px !important/);
});
