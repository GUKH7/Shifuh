const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const clients = fs.readFileSync("src/app/admin/(painel)/clients/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("total gasto do cliente não estoura o cartão mobile", () => {
  const workspace = fs.readFileSync("src/app/admin/(painel)/clients/ClientsWorkspace.tsx", "utf8");
  assert.match(clients, /<ClientsWorkspace/);
  assert.match(workspace, /grid grid-cols-3 gap-2/);
  assert.match(workspace, /min-w-0 rounded-xl/);
  assert.match(workspace, /break-words text-sm font-black tabular-nums/);
  assert.match(workspace, /formatMoney\(client\.totalSpent\)/);
});

test("quebra global de texto no mobile não é aplicada ao container inteiro", () => {
  assert.doesNotMatch(responsive, /\.admin-page-shell\s*\{[^}]*overflow-wrap/);
  assert.match(responsive, /\.admin-page-shell :where\(p, h1, h2, h3, h4, li, dd, dt\)/);
});
