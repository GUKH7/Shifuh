const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const storefrontScope = fs.readFileSync("src/app/[slug]/layout.module.css", "utf8");

test("vitrine preserva alvos de toque confortáveis no mobile", () => {
  assert.match(storefrontScope, /@media \(max-width: 639px\)/);
  assert.match(storefrontScope, /\[data-category-tab\][\s\S]*min-height: 44px/);
  assert.match(storefrontScope, /input\[placeholder="Buscar no cardápio"\][\s\S]*min-height: 44px/);
  assert.match(storefrontScope, /button\[aria-label="Minha conta"\][\s\S]*44px/);
  assert.match(storefrontScope, /button\[aria-label="Entrar na conta"\][\s\S]*44px/);
  assert.match(storefrontScope, /lucide-plus[\s\S]*min-width: 44px[\s\S]*min-height: 44px/);
});

test("vitrine respeita safe area inferior no mobile", () => {
  const safeAreaUses = storefrontScope.match(/env\(safe-area-inset-bottom\)/g) || [];
  assert.ok(safeAreaUses.length >= 2);
  assert.match(storefrontScope, /padding-bottom: calc\(7rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(storefrontScope, /bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)/);
});
