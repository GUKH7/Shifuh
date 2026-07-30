const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const clients = fs.readFileSync("src/app/admin/(painel)/clients/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("total gasto do cliente não quebra no cartão mobile", () => {
  assert.match(clients, /client-total-spent/);
  assert.match(clients, /Wallet size=\{14\} className="shrink-0"/);
  assert.match(responsive, /\.client-total-spent[\s\S]*grid-template-columns: auto max-content/);
  assert.match(responsive, /min-width: 8\.75rem !important/);
  assert.match(responsive, /\.client-total-spent > span[\s\S]*white-space: nowrap !important/);
  assert.match(responsive, /overflow-wrap: normal !important/);
  assert.match(responsive, /word-break: keep-all !important/);
});

test("quebra global de texto no mobile não é aplicada ao container inteiro", () => {
  assert.doesNotMatch(responsive, /\.admin-page-shell\s*\{[^}]*overflow-wrap/);
  assert.match(responsive, /\.admin-page-shell :where\(p, h1, h2, h3, h4, li, dd, dt\)/);
});
