const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const css = fs.readFileSync("src/app/admin/(painel)/dashboard-period.module.css", "utf8");

test("filtro global do dashboard tem hierarquia, foco e responsividade", () => {
  assert.match(css, /:has\(> label\[for="dashboard-period"\]\)/);
  assert.match(css, /:focus-within/);
  assert.match(css, /select#dashboard-period/);
  assert.match(css, /mask-image: url\("data:image\/svg\+xml/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /width: 100%;\s*min-width: 0;/);
});
