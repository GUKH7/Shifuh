const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const menu = fs.readFileSync(
  path.resolve(__dirname, "../src/app/admin/(painel)/menu/page.tsx"),
  "utf8",
);

test("category header exposes pause and reactivate actions", () => {
  assert.match(menu, /Pausar categoria/);
  assert.match(menu, /Reativar categoria/);
  assert.match(menu, /categoryStatusUpdatingId === category\.id/);
});
