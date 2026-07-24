const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pagePath = path.join(
  __dirname,
  "..",
  "src",
  "app",
  "admin",
  "(painel)",
  "menu",
  "page.tsx",
);

const source = fs.readFileSync(pagePath, "utf8");

test("usa modal próprio para confirmar exclusão de categoria", () => {
  assert.doesNotMatch(source, /\bconfirm\s*\(/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /Excluir categoria\?/);
  assert.match(source, /Excluir categoria/);
  assert.match(source, /Esta ação não pode ser desfeita/);
});

test("modal trata carregamento e erro da exclusão", () => {
  assert.match(source, /isDeletingCategory/);
  assert.match(source, /deleteCategoryError/);
  assert.match(source, /Excluindo\.\.\./);
});
