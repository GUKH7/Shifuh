const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const catalog = fs.readFileSync("src/lib/ifood/catalog.ts", "utf8");
const store = fs.readFileSync("src/lib/ifood/auth-store.ts", "utf8");
const diagnostics = fs.readFileSync(
  "src/app/api/integrations/ifood/diagnostics/route.ts",
  "utf8",
);
const page = fs.readFileSync("src/app/admin/integrations/ifood/page.tsx", "utf8");

test("token oficial do iFood possui cache persistente e renovação coordenada", () => {
  assert.match(catalog, /readPersistedIfoodToken/);
  assert.match(catalog, /persistIfoodToken/);
  assert.match(catalog, /tokenRequest/);
  assert.match(store, /aes-256-gcm/);
  assert.match(store, /IFOOD_TOKEN_ENCRYPTION_KEY/);
});

test("diagnóstico não devolve segredo ou prévia do token", () => {
  assert.match(diagnostics, /validateIfoodCredentials/);
  assert.doesNotMatch(diagnostics, /clientSecret\s*:/);
  assert.doesNotMatch(diagnostics, /tokenPreview/);
  assert.match(page, /Testar conexão/);
});

test("erros OAuth distinguem credenciais, escopos e indisponibilidade", () => {
  assert.match(catalog, /invalid_credentials/);
  assert.match(catalog, /missing_scope/);
  assert.match(catalog, /temporarily_unavailable/);
  assert.doesNotMatch(catalog, /token\.slice/);
});
