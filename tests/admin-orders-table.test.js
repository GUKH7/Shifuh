const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "orders", "page.tsx"), "utf8");
const utils = fs.readFileSync(path.join(root, "src", "app", "admin", "(painel)", "orders", "utils.ts"), "utf8");
const tableGrid = "grid-cols-[120px_1.25fr_0.9fr_0.65fr_0.85fr_1fr_0.9fr_0.85fr_190px]";

test("payment methods are translated into Portuguese", () => {
  assert.match(utils, /CASH: "Dinheiro"/);
  assert.match(utils, /CREDIT: "Crédito"/);
  assert.match(utils, /DEBIT: "Débito"/);
  assert.match(utils, /PIX: "Pix"/);
  assert.match(utils, /OFFLINE: "Na entrega"/);
  assert.match(utils, /\.map\(\(part\) => formatPaymentTerm\(String\(part\)\)\)/);
});

test("orders table separates value and payment using one aligned grid", () => {
  assert.match(page, /<span>Valor<\/span>\s+<span>Método de pagamento<\/span>/);
  assert.equal((page.match(new RegExp(tableGrid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 2);
  assert.match(page, /<span className="text-center">Ações<\/span>/);
  assert.match(page, /xl:justify-center/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /xl:min-w-\[1280px\]/);
});
