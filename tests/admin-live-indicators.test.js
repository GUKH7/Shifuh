const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "DashboardPeriodWorkspace.tsx"), "utf8");
const indicator = fs.readFileSync(path.join(root, "src", "components", "ui", "live-status-dot.tsx"), "utf8");

test("dashboard mantém indicadores vivos no status da loja e no acompanhamento em tempo real", () => {
  assert.match(dashboard, /Dashboard em tempo real/);
  assert.match(dashboard, /<LiveStatusDot className="text-current" \/>/);
  assert.match(dashboard, /<LiveStatusDot className=\{storeTone\.dot\} \/>/);
  assert.equal((dashboard.match(/<LiveStatusDot/g) || []).length, 2);
  assert.match(
    dashboard,
    /bg-\[var\(--brand-soft\)\] px-3 py-2 text-xs font-bold text-\[var\(--brand\)\]/,
  );
});

test("live indicator usa dimensões consistentes e animação SVG nativa", () => {
  assert.match(indicator, /className = "text-emerald-500"/);
  assert.match(indicator, /<svg/);
  assert.match(indicator, /className=\{`h-3 w-3 shrink-0 overflow-visible \$\{className\}`\}/);
  assert.match(indicator, /<animate/);
  assert.match(indicator, /attributeName="r"/);
  assert.match(indicator, /attributeName="opacity"/);
  assert.match(indicator, /repeatCount="indefinite"/);
  assert.match(indicator, /fill="currentColor"/);
  assert.match(indicator, /aria-hidden="true"/);
});
