import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/page.tsx",
  "utf8",
);
const prizes = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/WheelPrizesConfigurator.tsx",
  "utf8",
);

test("Roleta integra configurador de prêmios", () => {
  assert.match(page, /WheelPrizesConfigurator/);
  assert.match(prizes, /Prêmios e distribuição/);
  assert.match(prizes, /Adicionar resultado/);
});

test("Prêmios cobrem todos os tipos planejados", () => {
  assert.match(prizes, /Desconto percentual/);
  assert.match(prizes, /Desconto fixo/);
  assert.match(prizes, /Frete grátis/);
  assert.match(prizes, /Produto grátis/);
  assert.match(prizes, /Não foi dessa vez/);
});

test("Motor cobre probabilidade e frequência controlada", () => {
  assert.match(prizes, /Probabilidade \(%\)/);
  assert.match(prizes, /1 a cada X giros/);
  assert.match(prizes, /As probabilidades precisam somar 100%/);
  assert.match(prizes, /frequências equivalem/);
});

test("Configurador inclui limites por prêmio e campanha", () => {
  assert.match(prizes, /Limite total do prêmio/);
  assert.match(prizes, /Limite por cliente/);
  assert.match(prizes, /Máximo de prêmios distribuídos/);
  assert.match(prizes, /Orçamento promocional/);
  assert.match(prizes, /Pausar automaticamente ao atingir um limite/);
});
