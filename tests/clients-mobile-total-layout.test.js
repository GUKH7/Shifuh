const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const clients = fs.readFileSync("src/app/admin/(painel)/clients/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("total gasto do cliente não quebra no cartão mobile", () => {
  assert.match(clients, /client-total-spent/);
  assert.match(clients, /Wallet size=\{14\} className="shrink-0"/);
  assert.match(responsive, /\.client-total-spent[\s\S]*white-space: nowrap/);
  assert.match(responsive, /overflow-wrap: normal/);
  assert.match(responsive, /word-break: normal/);
});
