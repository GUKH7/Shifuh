const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadModule() {
  const filename = path.join(__dirname, "..", "src", "lib", "customer-account.ts");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { hashCustomerSessionToken, normalizeCustomerPhone } = loadModule();

test("normaliza celular brasileiro para o formato internacional", () => {
  assert.equal(normalizeCustomerPhone("(11) 98765-4321"), "+5511987654321");
  assert.equal(normalizeCustomerPhone("+55 11 98765-4321"), "+5511987654321");
  assert.equal(normalizeCustomerPhone("123"), null);
});

test("a vitrine remove o codigo do pais antes de aplicar a mascara", () => {
  const formatterPath = path.join(__dirname, "..", "src", "features", "checkout", "checkout-format.ts");
  const source = fs.readFileSync(formatterPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(formatterPath, module);
  loaded.filename = formatterPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(formatterPath));
  loaded._compile(compiled, formatterPath);
  assert.equal(loaded.exports.formatPhone("+55 11 98765-4321"), "(11) 98765-4321");
});

test("armazena somente hash irreversivel da sessao", () => {
  const token = "token-super-secreto";
  const hash = hashCustomerSessionToken(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(hash, hashCustomerSessionToken(token));
});

test("migracao protege contas e sessoes contra acesso publico", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260722150538_customer_phone_accounts.sql"),
    "utf8",
  );
  assert.match(migration, /customer_phone_accounts enable row level security/i);
  assert.match(migration, /customer_phone_sessions enable row level security/i);
  assert.match(migration, /revoke all on public\.customer_phone_sessions from anon, authenticated/i);
});
