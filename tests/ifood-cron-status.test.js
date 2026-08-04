const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadTypeScriptModule(relativePath) {
  const filePath = path.join(__dirname, "..", relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = new Module(filePath, module.parent);
  mod.filename = filePath;
  mod.paths = Module._nodeModulePaths(path.dirname(filePath));
  mod._compile(compiled, filePath);
  return mod.exports;
}

test("cron do iFood comunica sucesso, falha parcial e falha total no HTTP", () => {
  const { summarizeIfoodCronResults } = loadTypeScriptModule(
    "src/lib/ifood/cron-result.ts",
  );

  assert.deepEqual(summarizeIfoodCronResults([]), {
    ok: true,
    status: "success",
    httpStatus: 200,
    integrationsProcessed: 0,
    integrationsSucceeded: 0,
    integrationsFailed: 0,
  });

  assert.equal(
    summarizeIfoodCronResults([{ ok: true }, { ok: false }]).httpStatus,
    207,
  );
  assert.equal(
    summarizeIfoodCronResults([{ ok: false }, { ok: false }]).httpStatus,
    500,
  );
});

test("chave de criptografia do iFood exige ao menos 32 caracteres", () => {
  const {
    isIfoodTokenEncryptionKeyConfigured,
    requireIfoodTokenEncryptionKey,
  } = loadTypeScriptModule("src/lib/ifood/token-encryption-config.ts");

  assert.equal(isIfoodTokenEncryptionKeyConfigured("a".repeat(31)), false);
  assert.equal(isIfoodTokenEncryptionKeyConfigured(`  ${"a".repeat(32)}  `), true);
  assert.throws(
    () => requireIfoodTokenEncryptionKey("curta"),
    /pelo menos 32 caracteres/,
  );
});
