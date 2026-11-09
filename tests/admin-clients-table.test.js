const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const page = fs.readFileSync("src/app/admin/(painel)/clients/page.tsx", "utf8");
const clients = fs.readFileSync("src/app/admin/(painel)/clients/ClientsWorkspace.tsx", "utf8");
const hub = fs.readFileSync("src/features/clients/customer-hub.ts", "utf8");

test("Central shows last purchase, spending and points on mobile cards", () => {
  assert.match(page, /<ClientsWorkspace/);
  assert.match(clients, /Central de Clientes/);
  assert.match(clients, /Última compra/);
  assert.match(clients, /formatDate\(client\.lastOrderDate\)/);
  assert.match(clients, /Saldo de pontos/);
  assert.match(clients, /grid grid-cols-3 gap-2/);
  assert.match(clients, /formatMoney\(client\.totalSpent\)/);
});

test("customer cards retain search, sorting, pagination and expanded history", () => {
  assert.match(clients, /Buscar por nome ou telefone/);
  assert.match(clients, /sort === "spent"/);
  assert.match(clients, /sort === "orders"/);
  assert.match(clients, /PER_PAGE = 10/);
  assert.match(clients, /aria-expanded=\{opened\}/);
  assert.match(clients, /Histórico de fidelidade/);
});

test("customer address history is deduplicated and available for safe CSV exports", () => {
  assert.match(hub, /addresses: string\[\]/);
  assert.match(hub, /formatClientAddress\(order\.address\)/);
  assert.match(hub, /!profile\.addresses\.includes\(address\)/);
  assert.match(clients, /Endereços utilizados/);
  assert.match(clients, /client\.addresses\.map\(/);
  assert.match(clients, /client\.addresses\.join\(" \| "\)/);
  assert.match(clients, /csvCell/);
});
