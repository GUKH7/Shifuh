const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const layout = fs.readFileSync("src/app/admin/(painel)/coupons/layout.tsx", "utf8");
const styles = fs.readFileSync("src/app/admin/(painel)/coupons/coupons-search.css", "utf8");

test("busca de cupons reserva espaço para o ícone", () => {
  assert.match(layout, /import "\.\/coupons-search\.css"/);
  assert.match(styles, /Buscar código do cupom/);
  assert.match(styles, /padding-left: 2\.75rem !important/);
});
