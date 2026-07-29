const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "DashboardPeriodWorkspace.tsx"), "utf8");
const indicator = fs.readFileSync(path.join(root, "src", "components", "ui", "live-status-dot.tsx"), "utf8");
const indicatorStyles = fs.readFileSync(path.join(root, "src", "components", "ui", "live-status-dot.module.css"), "utf8");

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

test("live indicator uses consistent dimensions, colors and visible animation", () => {
  assert.match(indicator, /import styles from "\.\/live-status-dot\.module\.css"/);
  assert.match(indicator, /className = "text-emerald-500"/);
  assert.match(indicator, /className=\{styles\.pulse\}/);
  assert.match(indicator, /className=\{styles\.core\}/);
  assert.match(indicator, /aria-hidden="true"/);
  assert.match(indicatorStyles, /width: 0\.75rem/);
  assert.match(indicatorStyles, /height: 0\.75rem/);
  assert.match(indicatorStyles, /overflow: visible/);
  assert.match(indicatorStyles, /animation: live-status-pulse 1\.45s/);
  assert.match(indicatorStyles, /@keyframes live-status-pulse/);
});
