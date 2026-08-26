const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho mobile centraliza a identidade da loja", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /flex-direction:\s*column !important/);
  assert.match(storefrontLayout, /align-items:\s*center !important/);
  assert.match(storefrontLayout, /width:\s*68px !important/);
  assert.match(storefrontLayout, /height:\s*68px !important/);
  assert.match(storefrontLayout, /margin-top:\s*-34px !important/);
  assert.match(storefrontLayout, /text-align:\s*center !important/);
});

test("nome da loja fica centralizado sem truncamento agressivo", () => {
  assert.match(storefrontLayout, /font-size:\s*19px !important/);
  assert.match(storefrontLayout, /font-weight:\s*800 !important/);
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

test("metadados secundários permanecem leves e centralizados", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)[\s\S]*justify-content:\s*center !important/);
  assert.match(storefrontLayout, /> span > svg[\s\S]*width:\s*13px !important/);
  assert.doesNotMatch(storefrontLayout, /> span > svg[\s\S]*display:\s*none !important/);
});

test("acesso à conta continua discreto com alvo de toque adequado", () => {
  assert.match(storefrontLayout, /div\[class~="sm:hidden"\][\s\S]*position:\s*absolute !important/);
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*44px !important/);
  assert.match(storefrontLayout, /height:\s*44px !important/);
  assert.match(storefrontLayout, /background:\s*transparent !important/);
  assert.match(storefrontLayout, /width:\s*17px !important/);
});

test("cabeçalho continua próximo da navegação do cardápio", () => {
  assert.match(storefrontLayout, /padding-bottom:\s*4px !important/);
  assert.match(storefrontLayout, /\[data-catalog-nav\] > div[\s\S]*padding-top:\s*4px !important/);
});
