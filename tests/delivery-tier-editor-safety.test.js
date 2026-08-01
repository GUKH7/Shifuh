const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const page = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/page.tsx",
  "utf8",
);
const pricing = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery-pricing.ts",
  "utf8",
);
const numberField = fs.readFileSync(
  "src/app/admin/(painel)/settings/delivery/DeliveryNumberField.tsx",
  "utf8",
);

test("editor valida distâncias repetidas antes de salvar", () => {
  assert.match(pricing, /validateDeliveryTiers/);
  assert.match(pricing, /duplicateDistances/);
  assert.match(pricing, /Existem faixas repetidas/);
  assert.match(page, /validation\.isValid/);
  assert.match(page, /Já existe outra faixa com essa distância/);
});

test("linhas usam identificadores estáveis durante edição e remoção", () => {
  assert.match(page, /editorId: string/);
  assert.match(page, /key=\{tier\.editorId\}/);
  assert.match(page, /removeTier\(tier\.editorId\)/);
  assert.doesNotMatch(page, /key=\{index\}/);
});

test("alterações não salvas são protegidas e podem ser descartadas", () => {
  assert.match(page, /hasUnsavedChanges/);
  assert.match(page, /beforeunload/);
  assert.match(page, /Alterações não salvas/);
  assert.match(page, /handleDiscardChanges/);
  assert.match(page, /Descartar/);
});

test("campos exibem erro acessível sem perder controles mobile", () => {
  assert.match(numberField, /error\?: string/);
  assert.match(numberField, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(numberField, /role="alert"/);
  assert.match(numberField, /Diminuir \$\{label\}/);
  assert.match(numberField, /Aumentar \$\{label\}/);
});
