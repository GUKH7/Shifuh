const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pagePath = path.join(root, "src/app/admin/(painel)/page.tsx");
const cssPath = path.join(root, "src/app/admin/(painel)/dashboard-header-layout.module.css");

const pageSource = fs.readFileSync(pagePath, "utf8");
const cssSource = fs.readFileSync(cssPath, "utf8");

test("dashboard aplica o módulo de layout do cabeçalho", () => {
  assert.match(pageSource, /import headerStyles from "\.\/dashboard-header-layout\.module\.css"/);
  assert.match(pageSource, /<div className=\{styles\.page\}>/);
  assert.match(pageSource, /<div className=\{headerStyles\.page\}>/);
});

test("cards de situação da loja e período usam o mesmo tamanho no desktop", () => {
  assert.match(cssSource, /--dashboard-header-card-width: calc\(30% - 0\.2rem\)/);
  assert.match(cssSource, /--dashboard-header-card-height: 5\.5rem/);
  assert.match(cssSource, /> div:first-child > div:last-child \{/);
  assert.match(cssSource, /width: var\(--dashboard-header-card-width\)/);
  assert.match(cssSource, /height: var\(--dashboard-header-card-height\)/);
  assert.match(cssSource, /div:has\(> label\[for="dashboard-period"\]\)/);
  assert.match(cssSource, /min-height: var\(--dashboard-header-card-height\)/);
  assert.match(cssSource, /margin-left: auto/);
});

test("menu de três pontos da situação da loja permanece oculto", () => {
  assert.match(cssSource, /a\[aria-label="Abrir configurações da loja"\]/);
  assert.match(cssSource, /display: none !important/);
});
