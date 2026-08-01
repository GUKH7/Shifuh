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

test("mobile volta ao input simples e realmente compacto", () => {
  assert.match(numberField, /grid-cols-\[108px_minmax\(0,1fr\)\]/);
  assert.match(numberField, /grid-cols-\[minmax\(0,1fr\)\]/);
  assert.match(numberField, /min-h-10/);
  assert.match(numberField, /hidden min-h-11.*sm:inline-flex/);
  assert.match(numberField, /sm:grid-cols-\[36px_minmax\(0,1fr\)_36px\]/);
  assert.doesNotMatch(numberField, /grid-cols-\[40px_minmax\(0,1fr\)_40px\]/);
});

test("digitação mantém atalhos e descrição acessível", () => {
  assert.match(numberField, /event\.currentTarget\.select\(\)/);
  assert.match(numberField, /event\.key === "ArrowUp" \|\| event\.key === "ArrowDown"/);
  assert.match(numberField, /aria-describedby=\{error \|\| hint \? descriptionId : undefined\}/);
  assert.match(numberField, /useId\(\)/);
});

test("layout evita campos lado a lado em celulares", () => {
  assert.match(page, /lg:grid-cols-2 2xl:grid-cols-4/);
  assert.doesNotMatch(page, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(page, /key=\{tier\.editorId\}/);
  assert.doesNotMatch(page, /key=\{index\}/);
  assert.doesNotMatch(page, /key=\{`\$\{tier\.distance\}-\$\{index\}`\}/);
});
