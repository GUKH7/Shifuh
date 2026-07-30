import fs from "node:fs";

const clientsPath = "src/app/admin/(painel)/clients/page.tsx";
const responsivePath = "src/app/admin/(painel)/admin-responsive.css";
const testPath = "tests/clients-mobile-total-layout.test.js";

let clients = fs.readFileSync(clientsPath, "utf8");
const oldBadge = '<div className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#eefaf2] px-3 py-2 font-bold text-emerald-700">';
const newBadge = '<div className="client-total-spent inline-flex w-fit items-center gap-2 rounded-xl bg-[#eefaf2] px-3 py-2 font-bold text-emerald-700">';

if (!clients.includes("client-total-spent")) {
  if (!clients.includes(oldBadge)) {
    throw new Error("Badge de total gasto não encontrado na página de clientes.");
  }
  clients = clients.replace(oldBadge, newBadge);
}

clients = clients.replace('<Wallet size={14} />\n                    {formatMoney(client.totalSpent)}', '<Wallet size={14} className="shrink-0" />\n                    <span>{formatMoney(client.totalSpent)}</span>');
fs.writeFileSync(clientsPath, clients);

let responsive = fs.readFileSync(responsivePath, "utf8");
const rule = `

.client-total-spent {
  min-width: max-content;
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: normal;
}

@media (max-width: 639px) {
  .client-total-spent {
    align-self: start;
    justify-self: end;
  }
}
`;

if (!responsive.includes(".client-total-spent")) {
  responsive += rule;
}
fs.writeFileSync(responsivePath, responsive);

fs.writeFileSync(testPath, `const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const clients = fs.readFileSync("src/app/admin/(painel)/clients/page.tsx", "utf8");
const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("total gasto do cliente não quebra no cartão mobile", () => {
  assert.match(clients, /client-total-spent/);
  assert.match(clients, /Wallet size=\\{14\\} className="shrink-0"/);
  assert.match(responsive, /\\.client-total-spent[\\s\\S]*white-space: nowrap/);
  assert.match(responsive, /overflow-wrap: normal/);
  assert.match(responsive, /word-break: normal/);
});
`);

console.log("Correção do total gasto mobile aplicada.");
