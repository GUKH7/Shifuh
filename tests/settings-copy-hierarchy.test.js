const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/admin/(painel)/settings/SettingsSections.tsx",
  ),
  "utf8",
);

test("Configurações usa títulos sem repetição de loja e canal", () => {
  for (const copy of [
    "Presença digital",
    "Informações do negócio",
    "Identidade visual",
    "Serviços conectados",
    'title: "iFood"',
  ]) {
    assert.match(source, new RegExp(copy));
  }
});

test("seções recolhíveis informam o estado para leitores de tela", () => {
  assert.match(source, /aria-expanded=\{isOpen\}/);
});
