const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho da loja mantém identidade e contexto no mesmo bloco", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /grid-template-columns:\s*56px minmax\(0, 1fr\)/);
  assert.match(storefrontLayout, /flex-direction:\s*column/);
  assert.match(storefrontLayout, /font-size:\s*18px/);
  assert.match(storefrontLayout, /span:nth-child\(4\)[\s\S]*display:\s*none !important/);
  assert.match(storefrontLayout, /span:nth-child\(5\)[\s\S]*flex-basis:\s*100%/);
});

test("metadados inferiores deixam de parecer tabela", () => {
  assert.match(storefrontLayout, /> div:nth-of-type\(2\)/);
  assert.match(storefrontLayout, /border:\s*0 !important/);
  assert.match(storefrontLayout, /> span > svg[\s\S]*display:\s*none !important/);
  assert.match(storefrontLayout, /content:\s*"·"/);
});

test("acesso à conta fica visualmente discreto mantendo alvo de toque", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*44px/);
  assert.match(storefrontLayout, /height:\s*44px/);
  assert.match(storefrontLayout, /background:\s*transparent !important/);
  assert.match(storefrontLayout, /box-shadow:\s*none !important/);
  assert.match(storefrontLayout, /width:\s*18px !important/);
});
