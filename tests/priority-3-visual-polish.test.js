const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");
const primitives = read("src/components/ui/admin-primitives.tsx");
const responsive = read("src/app/admin/(painel)/admin-responsive.css");
const globals = read("src/app/globals.css");
const dashboard = read("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx");
const dashboardStyles = read("src/app/admin/(painel)/dashboard-period.module.css");
const datePicker = read("src/components/ui/admin-date-picker.tsx");

test("controles e cards usam tokens visuais compartilhados", () => {
  assert.match(globals, /--admin-control-height: 44px/);
  assert.match(globals, /--admin-radius-control: 14px/);
  assert.match(globals, /--admin-radius-card: 24px/);
  assert.match(primitives, /admin-button/);
  assert.match(primitives, /admin-page-header/);
  assert.match(responsive, /var\(--admin-control-height\)/);
  assert.match(responsive, /var\(--admin-radius-card\)/);
});

test("CSS administrativo não depende de strings Tailwind ou posição dos elementos", () => {
  for (const source of [responsive, dashboardStyles]) {
    assert.doesNotMatch(source, /:has|nth-child|first-child|last-child|\[class\*=/);
  }
  assert.match(dashboard, /dashboard-metric-card/);
  assert.match(dashboard, /dashboard-period-control/);
  assert.match(dashboard, /dashboard-top-products-card/);
});

test("navegação por teclado cobre ordenação calendário e foco visível", () => {
  assert.match(primitives, /aria-pressed=\{active\}/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
    assert.match(datePicker, new RegExp(key));
  }
  assert.match(datePicker, /triggerRef\.current\?\.focus/);
  assert.match(datePicker, /data-date=\{dateValue\}/);
  assert.match(responsive, /:focus-visible/);
});

test("textos administrativos não contêm erros recorrentes de acentuação", () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(target);
    }
  };
  walk("src");
  const source = files.map(read).join("\n");
  assert.doesNotMatch(source, /Ticket medio|Ultima compra|Configuracoes|Historico|sem comentario|\bvisiveis\b/);
});
