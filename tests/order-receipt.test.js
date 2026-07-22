const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const projectRoot = path.join(__dirname, "..");
const utilsPath = path.join(projectRoot, "src", "app", "admin", "(painel)", "orders", "utils.ts");
const pagePath = path.join(projectRoot, "src", "app", "admin", "(painel)", "orders", "page.tsx");

function loadUtils() {
  const source = fs.readFileSync(utilsPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = new Module(utilsPath, module);
  loaded.filename = utilsPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(utilsPath));
  loaded._compile(compiled, utilsPath);
  return loaded.exports;
}

const { calculateCashChange, getAddonPrice, parseMoneyAmount } = loadUtils();

test("normaliza valores monetarios informados para troco", () => {
  assert.equal(parseMoneyAmount("R$ 100,00"), 100);
  assert.equal(parseMoneyAmount("1.250,50"), 1250.5);
  assert.equal(parseMoneyAmount("invalido"), null);
});

test("calcula o troco sem erros de ponto flutuante", () => {
  assert.deepEqual(calculateCashChange("100,00", 72.98), { received: 100, change: 27.02 });
  assert.equal(calculateCashChange("50,00", 72.98), null);
});

test("normaliza o valor adicional salvo no complemento", () => {
  assert.equal(getAddonPrice({ name: "Bacon", price: "3.50" }), 3.5);
  assert.equal(getAddonPrice({ name: "Sem custo" }), 0);
});

test("comanda apresenta complementos, valor recebido e troco", () => {
  const source = fs.readFileSync(pagePath, "utf8");
  assert.match(source, /Complementos/);
  assert.match(source, /getAddonPrice\(addon\)/);
  assert.match(source, /Valor recebido/);
  assert.match(source, /cashChange\.change/);
});
