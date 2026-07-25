const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "page.tsx"), "utf8");
const indicator = fs.readFileSync(path.join(root, "src", "components", "ui", "live-status-dot.tsx"), "utf8");

test("real-time dashboard labels share the same live indicator", () => {
  assert.match(dashboard, /<LiveStatusDot className="text-current" \/>\s+Dashboard em tempo real/);
  assert.match(dashboard, /<LiveStatusDot \/>\s+<p className="font-bold text-emerald-800">Loja em operação/);
  assert.equal((dashboard.match(/<LiveStatusDot(?: className="text-current")? \/>/g) || []).length, 2);
  assert.match(
    dashboard,
    /bg-\[var\(--brand-soft\)\] px-3 py-1\.5 text-xs font-bold text-\[var\(--brand\)\]/,
  );
});

test("live indicator uses consistent dimensions, colors and accessible animation", () => {
  assert.match(indicator, /relative inline-flex h-3 w-3 shrink-0/);
  assert.match(indicator, /className = "text-emerald-500"/);
  assert.match(indicator, /animate-ping rounded-full bg-current opacity-60/);
  assert.match(indicator, /motion-reduce:animate-none/);
  assert.match(indicator, /h-3 w-3 rounded-full bg-current/);
  assert.match(indicator, /aria-hidden="true"/);
});
