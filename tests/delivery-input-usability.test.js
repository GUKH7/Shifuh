const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/page.tsx",
  "utf8",
);
const numberField = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/DeliveryNumberField.tsx",
  "utf8",
);

test("campos de entrega permitem apagar e digitar antes de normalizar", () => {
  assert.match(numberField, /type="text"/);
  assert.match(numberField, /inputMode=\{decimals > 0 \? "decimal" : "numeric"\}/);
  assert.match(numberField, /const decimalPattern =/);
  assert.match(numberField, /replace\(",", "\."\)/);
  assert.match(numberField, /parsed \?\? value/);
  assert.doesNotMatch(page, /Number\(event\.target\.value\) \|\| 0\.1/);
});

test("campos possuem controles de toque e seleção rápida", () => {
  assert.match(numberField, /Diminuir \$\{label\}/);
  assert.match(numberField, /Aumentar \$\{label\}/);
  assert.match(numberField, /event\.currentTarget\.select\(\)/);
  assert.match(numberField, /min-h-12/);
});

test("layout evita campos lado a lado em celulares", () => {
  assert.match(page, /lg:grid-cols-2 2xl:grid-cols-4/);
  assert.doesNotMatch(page, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(page, /key=\{index\}/);
  assert.doesNotMatch(page, /key=\{`\$\{tier\.distance\}-\$\{index\}`\}/);
});
