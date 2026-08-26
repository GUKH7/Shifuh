const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho mobile dá mais espaço à identidade da loja", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /grid-template-columns:\s*50px minmax\(0, 1fr\)/);
  assert.match(storefrontLayout, /display:\s*contents !important/);
  assert.match(storefrontLayout, /font-size:\s*17px !important/);
  assert.match(storefrontLayout, /white-space:\s*nowrap !important/);
  assert.match(storefrontLayout, /text-overflow:\s*ellipsis !important/);
});

test("status e entrega usam a largura total do cabeçalho", () => {
  assert.match(storefrontLayout, /grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(storefrontLayout, /span:nth-child\(4\)[\s\S]*display:\s*none !important/);
  assert.doesNotMatch(storefrontLayout, /span:nth-child\(5\)[\s\S]*flex-basis:\s*100%/);
});

test("metadados secundários permanecem leves sem esconder os ícones", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)/);
  assert.match(storefrontLayout, /border:\s*0 !important/);
  assert.match(storefrontLayout, /> span > svg[\s\S]*width:\s*13px !important/);
  assert.doesNotMatch(storefrontLayout, /> span > svg[\s\S]*display:\s*none !important/);
});

test("acesso à conta continua discreto com alvo de toque adequado", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*44px/);
  assert.match(storefrontLayout, /height:\s*44px/);
  assert.match(storefrontLayout, /background:\s*transparent !important/);
  assert.match(storefrontLayout, /width:\s*17px !important/);
});

test("cabeçalho aproxima informações da navegação do cardápio", () => {
  assert.match(storefrontLayout, /padding-bottom:\s*4px !important/);
  assert.match(storefrontLayout, /\[data-catalog-nav\] > div[\s\S]*padding-top:\s*4px !important/);
});
