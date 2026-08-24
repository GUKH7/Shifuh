const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho da loja mantém hierarquia compacta no mobile", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /padding:\s*14px 16px 0/);
  assert.match(storefrontLayout, /grid-template-columns:\s*minmax\(0, 0\.9fr\) minmax\(0, 1\.1fr\)/);
  assert.match(storefrontLayout, /border-top:\s*1px solid #eef0f2/);
  assert.match(storefrontLayout, /font-size:\s*19px/);
});

test("acesso à conta continua com alvo de toque acessível", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*44px/);
  assert.match(storefrontLayout, /height:\s*44px/);
});
