const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/admin/login/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(root, "src/app/api/admin/login/route.ts"), "utf8");

test("login administrativo usa rota interna em vez de autenticação direta no navegador", () => {
  assert.match(page, /fetch\("\/api\/admin\/login"/);
  assert.match(page, /router\.replace\("\/admin"\)/);
  assert.match(page, /AbortController/);
  assert.doesNotMatch(page, /else \{\s*const \{ error \} = await supabase\.auth\.signInWithPassword/);
});

test("rota de login cria sessão Supabase e traduz erros de rede", () => {
  assert.match(route, /createServerClient/);
  assert.match(route, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(route, /response\.cookies\.set/);
  assert.match(route, /Não foi possível conectar ao serviço de autenticação/);
  assert.match(route, /E-mail ou senha incorretos/);
});
