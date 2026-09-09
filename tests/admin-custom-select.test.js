const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const customSelect = fs.readFileSync("src/components/ui/admin-select.tsx", "utf8");

test("AdminSelect delega listas simples ao dropdown customizado", () => {
  assert.match(primitives, /import \{ AdminCustomSelect \}/);
  assert.match(primitives, /<AdminCustomSelect/);
  assert.match(primitives, /if \(multiple \|\|/);
  assert.match(primitives, /<select[\s\S]*multiple=\{multiple\}/);
});

test("dropdown usa a identidade visual do Shifuh em vez do popup nativo", () => {
  assert.match(customSelect, /role="listbox"/);
  assert.match(customSelect, /role="option"/);
  assert.match(customSelect, /aria-selected=\{selected\}/);
  assert.match(customSelect, /bg-\[#fffdfa\]/);
  assert.match(customSelect, /text-\[var\(--brand\)\]/);
  assert.match(customSelect, /bg-\[#fff1e8\]/);
  assert.match(customSelect, /radius-panel/);
  assert.match(customSelect, /<Check/);
});

test("select nativo fica oculto para manter forms, name e ref sem abrir lista do sistema", () => {
  assert.match(customSelect, /<select[\s\S]*className="sr-only"/);
  assert.match(customSelect, /name=\{name\}/);
  assert.match(customSelect, /required=\{required\}/);
  assert.match(customSelect, /form=\{form\}/);
  assert.match(customSelect, /assignRef\(forwardedRef, node\)/);
});

test("dropdown suporta mouse, fechamento externo e navegação por teclado", () => {
  assert.match(customSelect, /document\.addEventListener\("pointerdown"/);
  assert.match(customSelect, /event\.key === "ArrowDown"/);
  assert.match(customSelect, /event\.key === "ArrowUp"/);
  assert.match(customSelect, /event\.key === "Home"/);
  assert.match(customSelect, /event\.key === "End"/);
  assert.match(customSelect, /event\.key === "Enter"/);
  assert.match(customSelect, /event\.key === "Escape"/);
});
