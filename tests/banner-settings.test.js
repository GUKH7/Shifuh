const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const settingsPagePath = path.join(
  __dirname,
  "..",
  "src",
  "app",
  "admin",
  "(painel)",
  "settings",
  "page.tsx",
);

const source = fs.readFileSync(settingsPagePath, "utf8");

test("mantém o banner responsivo em 16:7", () => {
  assert.match(source, /setCropAspect\(target === "logo" \? 1 : 16 \/ 7\)/);
  assert.match(source, /proporção horizontal `16:7`/);
  assert.match(source, /Tamanho ideal: `1600x700 px` ou maior/);
  assert.match(source, /Mantenha textos e elementos importantes na região central da imagem/);
  assert.doesNotMatch(source, /proporção horizontal `3:1`/);
  assert.doesNotMatch(source, /1500x500 px/);
});

test("informa o erro real quando o upload falha", () => {
  assert.match(source, /error instanceof Error/);
  assert.match(source, /\? error\.message/);
});
