const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const styles = fs.readFileSync(
  "src/app/admin/(painel)/dashboard-period.module.css",
  "utf8",
);

test("títulos dos cards de métricas não quebram em notebooks", () => {
  assert.match(styles, /\.page > section:first-of-type/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /min-width:\s*1280px/);
  assert.match(styles, /max-width:\s*1535px/);
});
