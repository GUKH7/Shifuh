import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const primitives = fs.readFileSync("src/components/ui/admin-primitives.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");
const globals = fs.readFileSync("src/app/globals.css", "utf8");

test("controles administrativos usam tokens compartilhados", () => {
  assert.match(globals, /--admin-control-height: 44px/);
  assert.match(globals, /--radius-control: 12px/);
  assert.match(globals, /--radius-panel: 20px/);
  assert.match(globals, /--admin-radius-control: var\(--radius-control\)/);
  assert.match(globals, /--admin-radius-card: var\(--radius-panel\)/);
  assert.match(primitives, /admin-control/);
  assert.match(primitives, /admin-button/);
});

test("controles administrativos usam foco laranja e selects padronizados", () => {
  assert.match(responsive, /admin-control:focus-visible/);
  assert.match(responsive, /border-color: var\(--brand\)/);
  assert.match(responsive, /admin-select/);
  assert.match(responsive, /padding-right: 2\.75rem/);
});
