const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const styles = fs.readFileSync("src/app/globals.css", "utf8");

test("controles do painel usam foco laranja e altura padronizada", () => {
  assert.match(styles, /\.admin-page-shell/);
  assert.match(styles, /min-height:\s*2\.75rem/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /border-color:\s*var\(--brand\)\s*!important/);
  assert.match(styles, /rgba\(255,\s*90,\s*31,\s*0\.12\)/);
});

test("selects do painel reservam espaço para uma seta consistente", () => {
  assert.match(styles, /select:not\(\[multiple\]\)/);
  assert.match(styles, /appearance:\s*none/);
  assert.match(styles, /background-position:\s*right\s+0\.9rem\s+center/);
  assert.match(styles, /padding-right:\s*2\.75rem\s*!important/);
});

test("inputs transparentes destacam o container no foco", () => {
  assert.match(styles, /:has\(> input\.bg-transparent:focus-visible\)/);
});
