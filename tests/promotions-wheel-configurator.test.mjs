import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/page.tsx",
  "utf8",
);
const configurator = fs.readFileSync(
  "src/app/admin/(painel)/promotions/wheel/WheelConfigurator.tsx",
  "utf8",
);

test("Roleta da Sorte usa o configurador administrativo", () => {
  assert.match(page, /WheelConfigurator/);
  assert.match(configurator, /Nome da campanha/);
  assert.match(configurator, /Status/);
  assert.match(configurator, /Período da campanha/);
});

test("Configurador cobre todas as regras de liberação planejadas", () => {
  assert.match(configurator, /Após um pedido/);
  assert.match(configurator, /Pedido mínimo/);
  assert.match(configurator, /A cada X pedidos/);
  assert.match(configurator, /A cada R\$ X gastos/);
  assert.match(configurator, /Primeira compra/);
  assert.match(configurator, /Dias e horários específicos/);
  assert.match(configurator, /Limite por cliente/);
});

test("Configurador valida campanha antes da etapa de prêmios", () => {
  assert.match(configurator, /Validar configuração/);
  assert.match(configurator, /Configuração válida/);
  assert.match(configurator, /Ative pelo menos uma regra para liberar giros/);
  assert.match(configurator, /O fim da campanha precisa acontecer depois do início/);
});
