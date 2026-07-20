const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

process.env.ORDER_TRACKING_SECRET = "test-order-tracking-secret-with-at-least-32-bytes";

const helperPath = path.join(__dirname, "..", "src", "lib", "order-tracking.ts");
const compiled = ts.transpileModule(fs.readFileSync(helperPath, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helperModule = new Module(helperPath, module.parent);
helperModule.filename = helperPath;
helperModule.paths = Module._nodeModulePaths(path.dirname(helperPath));
helperModule._compile(compiled, helperPath);

const { createOrderTrackingToken, verifyOrderTrackingToken } = helperModule.exports;

test("gera token opaco e valida somente o pedido correto", () => {
  const token = createOrderTrackingToken("order-123");

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyOrderTrackingToken("order-123", token), true);
  assert.equal(verifyOrderTrackingToken("order-456", token), false);
  const tamperedToken = `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`;
  assert.equal(verifyOrderTrackingToken("order-123", tamperedToken), false);
});

test("rejeita token ausente ou malformado sem lançar erro", () => {
  assert.equal(verifyOrderTrackingToken("order-123", ""), false);
  assert.equal(verifyOrderTrackingToken("order-123", "token-curto"), false);
});
