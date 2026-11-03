"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const target = "/admin/pontos";

test("the dedicated credit screen is protected by the existing admin layout and reuses the audited form", () => {
  const route = read("src/app/admin/(painel)/pontos/page.tsx");
  assert.match(route, /ManualLoyaltyCredit/);
  assert.match(route, /<ManualLoyaltyCredit\s*\/>/);
  assert.match(route, /href="\/admin"/);
  assert.match(route, /href="\/admin\/promotions\/loyalty"/);
  assert.doesNotMatch(route, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("the persistent header exposes a one-tap accessible credit shortcut", () => {
  const source = read("src/components/admin-header-actions.tsx");
  assert.match(source, /href="\/admin\/pontos" aria-label="Adicionar pontos"/);
  assert.match(source, /min-h-10/);
  assert.match(source, /hidden sm:inline/);
});

test("dashboard, sidebar and panel search all reach the same destination", () => {
  const dashboard = read("src/app/admin/(painel)/DashboardPeriodWorkspace.tsx");
  const sidebar = read("src/components/admin-sidebar.tsx");
  const layout = read("src/app/admin/(painel)/layout.tsx");
  assert.match(dashboard, /href="\/admin\/pontos" aria-label="Adicionar pontos de fidelidade"/);
  assert.match(sidebar, /name: "Adicionar pontos", href: "\/admin\/pontos"/);
  assert.match(layout, /label: "Adicionar pontos", href: "\/admin\/pontos"/);
  assert.ok([dashboard, sidebar, layout].every(source => source.includes(target)));
});

test("quick access must not loosen transactional customer authorization", () => {
  const form = read("src/features/loyalty/ManualLoyaltyCredit.tsx");
  assert.match(form, /\.rpc\("credit_loyalty_points_manual"/);
  assert.match(form, /validateManualCredit/);
  assert.match(form, /setCreditError/);
  assert.doesNotMatch(form, /\.from\("loyalty_accounts"\)\.update\(/);
});
