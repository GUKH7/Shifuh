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

test("Roleta da Sorte usa o workspace administrativo persistido", () => {
  assert.match(page, /WheelCampaignWorkspace/);
  assert.match(workspace, /title="Campanha"/);
  assert.match(workspace, />Nome</);
  assert.match(workspace, />Status</);
  assert.match(workspace, />Início</);
  assert.match(workspace, />Fim</);
});

test("Workspace cobre todas as regras de liberação planejadas", () => {
  assert.match(workspace, /Após um pedido/);
  assert.match(workspace, /Pedido mínimo/);
  assert.match(workspace, /A cada X pedidos/);
  assert.match(workspace, /A cada R\$ X gastos/);
  assert.match(workspace, /Primeira compra/);
  assert.match(workspace, /Dias e horários/);
  assert.match(workspace, /Limite por cliente/);
});

test("Workspace valida a campanha e salva no motor persistido", () => {
  assert.match(workspace, /Ative pelo menos uma regra de liberação do giro/);
  assert.match(workspace, /Defina um período válido para a campanha/);
  assert.match(workspace, /save_promotion_wheel_campaign/);
  assert.match(workspace, /Persistência conectada/);
});
