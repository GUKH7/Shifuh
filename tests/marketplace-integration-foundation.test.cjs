const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const sourcesFile = path.join(root, "src/lib/integrations/order-channels.ts");
const source = fs.readFileSync(sourcesFile, "utf8");
const transformed = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = new Module(sourcesFile, module);
mod.filename = sourcesFile;
mod.paths = Module._nodeModulePaths(path.dirname(sourcesFile));
mod._compile(transformed, sourcesFile);
const { is99FoodOrder, getExternalOrderIdentity } = mod.exports;

test("classifica 99Food independentemente de espaços e capitalização", () => {
  assert.equal(is99FoodOrder({ external_source: " 99FOOD " }), true);
  assert.equal(is99FoodOrder({ external_source: "99food" }), true);
  assert.equal(is99FoodOrder({ external_source: "ifood" }), false);
  assert.equal(is99FoodOrder({ external_source: null }), false);
  assert.equal(is99FoodOrder({}), false);
});

test("identidade de pedido externo diferencia plataforma e restaurante", () => {
  const one = getExternalOrderIdentity("restaurant-a", "ifood", "order-42");
  const second = getExternalOrderIdentity("restaurant-a", "99food", "order-42");
  const third = getExternalOrderIdentity("restaurant-b", "ifood", "order-42");
  assert.notEqual(one, second);
  assert.notEqual(one, third);
  assert.equal(getExternalOrderIdentity("restaurant-a", "ifood", "order-42"), one);
  assert.throws(() => getExternalOrderIdentity(" ", "99food", "order"), /obrigatórios/);
  assert.throws(() => getExternalOrderIdentity("restaurant", "99food", ""), /obrigatórios/);
});

test("iFood busca pedidos externos somente no seu próprio canal", () => {
  const file = fs.readFileSync(path.join(root, "src/lib/ifood/order-sync.ts"), "utf8");
  assert.match(file, /\.eq\("restaurant_id", restaurantId\)\s*\.eq\("external_source", "ifood"\)\s*\.eq\("external_order_id", event\.orderId\)/);
});

test("painel prepara 99Food sem declarar conexão ativa nem criar webhook", () => {
  const page = fs.readFileSync(path.join(root, "src/app/admin/(painel)/integrations/page.tsx"), "utf8");
  const sidebar = fs.readFileSync(path.join(root, "src/components/admin-sidebar.tsx"), "utf8");
  assert.match(sidebar, /name: "Integrações", href: "\/admin\/integrations"/);
  assert.match(page, /href="\/admin\/integrations\/ifood"/);
  assert.match(page, /href="https:\/\/developer-food\.99app\.com\/pt-BR\/home"/);
  assert.match(page, /Aguardando homologação/);
  assert.match(page, /não possui autorização nem conector ativo/);
});

test("ações 99Food sem conector ficam inacessíveis na interface e no PATCH", () => {
  const orders = fs.readFileSync(path.join(root, "src/features/orders/OrdersPage.tsx"), "utf8");
  const api = fs.readFileSync(path.join(root, "src/app/api/orders/[id]/status/route.ts"), "utf8");
  assert.match(orders, /option value="99food"/);
  assert.match(orders, /channelLabel === "99Food"/);
  assert.match(orders, /if \(is99FoodOrder\(order\)\) return "";/);
  assert.match(orders, /if \(is99FoodOrder\(order\)\) \{/);
  assert.match(api, /if \(is99FoodOrder\(order\)\)/);
  assert.match(api, /status: 409/);
});
