const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const storefrontLayout = fs.readFileSync(
  path.join(root, "src/app/[slug]/layout.module.css"),
  "utf8",
);

test("cabeçalho da loja mantém hierarquia fluida no mobile", () => {
  assert.match(storefrontLayout, /@media \(max-width: 639px\)/);
  assert.match(storefrontLayout, /grid-template-columns:\s*56px minmax\(0, 1fr\)/);
  assert.match(storefrontLayout, /grid-column:\s*1 \/ -1/);
  assert.match(storefrontLayout, /font-size:\s*18px/);
  assert.match(storefrontLayout, /border-top:\s*0 !important/);
  assert.match(storefrontLayout, /content:\s*"·"/);
});

test("acesso à conta fica discreto sem perder área de toque útil", () => {
  assert.match(storefrontLayout, /button\[aria-label="Minha conta"\]/);
  assert.match(storefrontLayout, /width:\s*40px/);
  assert.match(storefrontLayout, /height:\s*40px/);
  assert.match(storefrontLayout, /background:\s*transparent !important/);
});
