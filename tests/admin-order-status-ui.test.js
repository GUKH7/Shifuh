const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const statusMeta = fs.readFileSync(path.join(root, "src", "lib", "order-status.ts"), "utf8");
const badge = fs.readFileSync(path.join(root, "src", "components", "ui", "order-status-badge.tsx"), "utf8");
const orders = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "orders", "page.tsx"), "utf8");
const history = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "history", "page.tsx"), "utf8");
const account = fs.readFileSync(path.join(root, "src", "app", "minha-conta", "page.tsx"), "utf8");

test("order statuses have one Portuguese visual standard", () => {
  assert.match(statusMeta, /pending: \{ label: "Pendente"/);
  assert.match(statusMeta, /done: \{ label: "Concluído"/);
  assert.match(statusMeta, /preparing: \{ label: "Em preparo"/);
  assert.match(statusMeta, /delivering: \{ label: "Em rota"/);
  assert.match(statusMeta, /canceled: \{ label: "Cancelado"/);
  assert.doesNotMatch(statusMeta, /"Pending"|"Done"/);
});

test("status badges are rounded and always include a leading dot", () => {
  assert.match(badge, /rounded-full border font-bold/);
  assert.match(badge, /aria-hidden="true"/);
  assert.match(badge, /<LiveStatusDot className=\{dotClassName\} \/>/);
  assert.match(badge, /h-3 w-3 shrink-0 overflow-visible/);
  assert.match(badge, /<circle cx="12" cy="12" r="4\.5" fill="currentColor" \/>/);
});

test("orders, history and customer account share the status badge", () => {
  assert.match(orders, /<OrderStatusBadge status=\{order\.status\}/);
  assert.match(history, /<OrderStatusBadge status=\{order\.status\} className="whitespace-nowrap" \/>/);
  assert.match(account, /<OrderStatusBadge status=\{order\.status\} \/>/);
  assert.doesNotMatch(history, /function getStatusClasses/);
});
