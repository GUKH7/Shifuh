const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "orders", "page.tsx"), "utf8");
const utils = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "orders", "utils.ts"), "utf8");
const tableGrid = "grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px]";

test("payment methods are translated into Portuguese", () => {
  assert.match(utils, /CASH: "Dinheiro"/);
  assert.match(utils, /CREDIT: "CRÉDITO"/);
  assert.match(utils, /DEBIT: "DÉBITO"/);
  assert.match(utils, /PIX: "Pix"/);
  assert.match(utils, /OFFLINE: "Na entrega"/);
  assert.match(utils, /\.map\(\(part\) => formatPaymentTerm\(String\(part\)\)\)/);
});

test("orders table separates value and payment using one aligned grid", () => {
  assert.match(page, /<span>Valor<\/span>\s+<span className="whitespace-nowrap">Método de pagamento<\/span>/);
  assert.doesNotMatch(page, /Método de<br \/>pagamento/);
  assert.equal((page.match(new RegExp(tableGrid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 2);
  assert.match(page, /<span className="text-center">Ações<\/span>/);
  assert.match(page, /xl:justify-center/);
  assert.match(page, /overflow-hidden rounded-\[18px\]/);
  assert.doesNotMatch(page, /min-w-\[1280px\]/);
});

test("order rows omit customer avatars and keep semantic labels on mobile", () => {
  assert.doesNotMatch(page, /getCustomerInitials/);
  assert.match(page, /orders-table-header admin-table-header/);
  assert.match(page, /data-label="Cliente"/);
  assert.match(page, /data-label="Canal"/);
  assert.match(page, /data-label="Status"/);
  assert.match(page, /data-label="Horário"/);
  assert.match(page, /orders-table-cell flex justify-center" data-label="Status">\s+<OrderStatusBadge/);
  assert.match(page, /orders-table-cell text-center" data-label="Horário">\s+<p className="text-xs font-black text-gray-950">\{getRelativeOrderTime/);
});

test("order actions use compact labels without losing accessible names", () => {
  assert.match(page, /if \(order\.status === "pending"\) return "Aceitar"/);
  assert.match(page, /\? "Pronto"\s+: "Despachar"/);
  assert.match(page, /if \(order\.status === "delivering"\) return "Concluir"/);
  assert.match(page, /aria-label=\{primaryActionLabel\}/);
  assert.match(page, /h-9 w-9 shrink-0/);
  assert.match(
    page,
    /aria-label=\{primaryActionLabel\}[\s\S]*aria-label="Imprimir pedido"[\s\S]*aria-label="Ver detalhes do pedido"/,
  );
});

test("details action stays at the far right without a duplicate items link", () => {
  assert.doesNotMatch(page, />\s*Ver detalhes\s*<\/button>/);
  assert.match(
    page,
    /aria-label="Imprimir pedido"[\s\S]*aria-label="Ver detalhes do pedido"/,
  );
});
