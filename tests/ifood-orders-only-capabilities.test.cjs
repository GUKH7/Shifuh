const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
test("Order-only mode blocks optional modules while cutover pauses order calls", () => {
  const file = require("node:path").resolve("src/lib/ifood/capabilities.ts");
  const mod = new Module(file, module);
  mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
  const oldMode=process.env.IFOOD_ORDERS_ONLY, oldPause=process.env.IFOOD_CUTOVER_PAUSED;
  try {
    delete process.env.IFOOD_ORDERS_ONLY; delete process.env.IFOOD_CUTOVER_PAUSED;
    assert.doesNotThrow(mod.exports.assertIfoodModuleAvailable);
    process.env.IFOOD_ORDERS_ONLY="true";
    assert.doesNotThrow(mod.exports.assertIfoodOrdersAvailable);
    assert.throws(mod.exports.assertIfoodModuleAvailable,/não habilitado/);
    process.env.IFOOD_CUTOVER_PAUSED="true";
    assert.throws(mod.exports.assertIfoodOrdersAvailable,/suspensa/);
  } finally {
    if(oldMode===undefined) delete process.env.IFOOD_ORDERS_ONLY; else process.env.IFOOD_ORDERS_ONLY=oldMode;
    if(oldPause===undefined) delete process.env.IFOOD_CUTOVER_PAUSED; else process.env.IFOOD_CUTOVER_PAUSED=oldPause;
  }
});
