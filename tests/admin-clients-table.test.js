const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const clients = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "admin", "(painel)", "clients", "page.tsx"),
  "utf8",
);

test("last purchase header and values share centered alignment", () => {
  assert.match(clients, /justify-self-center whitespace-nowrap text-center">Última compra/);
  assert.match(clients, /justify-self-center text-center font-semibold text-gray-600">\{formatDate\(client\.lastOrderDate\)\}/);
});

test("client table header and rows remain vertically aligned", () => {
  const grid = "grid-cols-[1.3fr_1fr_120px_160px_140px_110px] items-center";
  const escaped = grid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.equal((clients.match(new RegExp(escaped, "g")) || []).length, 2);
});
