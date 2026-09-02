import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/page.tsx",
  "utf8",
);
const workspace = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/WheelCampaignWorkspace.tsx",
  "utf8",
);

test("Roleta integra prêmios no workspace persistido", () => {
  assert.match(page, /WheelCampaignWorkspace/);
  assert.match(workspace, /title="Prêmios"/);
  assert.match(workspace, /makePrize/);
});

test("Prêmios cobrem todos os tipos planejados", () => {
  assert.match(workspace, /Desconto percentual/);
  assert.match(workspace, /Desconto fixo/);
  assert.match(workspace, /Frete grátis/);
  assert.match(workspace, /Produto grátis/);
  assert.match(workspace, /Não foi dessa vez/);
  assert.match(workspace, /Produto do cardápio/);
});

test("Motor cobre probabilidade e frequência controlada", () => {
  assert.match(workspace, /Probabilidade \(%\)/);
  assert.match(workspace, /1 a cada X giros/);
  assert.match(workspace, /As probabilidades precisam somar 100%/);
  assert.match(workspace, /As frequências configuradas ultrapassam 100% dos giros/);
});

test("Workspace inclui limites por prêmio e campanha", () => {
  assert.match(workspace, /title="Limite total"/);
  assert.match(workspace, /Limite por cliente/);
  assert.match(workspace, /Máximo de prêmios/);
  assert.match(workspace, /Orçamento promocional/);
  assert.match(workspace, /Pausar ao atingir limite/);
});
