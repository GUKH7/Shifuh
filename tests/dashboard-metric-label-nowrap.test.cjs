const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const styles = fs.readFileSync(
  "src/app/admin/(painel)/dashboard-period.module.css",
  "utf8",
);

test("títulos dos cards de métricas não quebram em duas linhas", () => {
  assert.match(
    styles,
    /\.page :global\(\.admin-page-shell\) > section\[class\*="xl:grid-cols-5"\][\s\S]*white-space: nowrap !important;/,
  );
  assert.match(styles, /@media \(min-width: 1280px\) and \(max-width: 1535px\)/);
  assert.match(styles, /font-size: 0\.75rem;/);
});
