const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const periodSelect = fs.readFileSync(
  "src/components/ui/admin-dashboard-period-select.tsx",
  "utf8",
);

test("painel de período acompanha toda a largura do box", () => {
  assert.match(periodSelect, /className="w-full min-w-0"/);
  assert.match(
    periodSelect,
    /dashboard-period-options absolute inset-x-0[\s\S]*w-full min-w-0/,
  );
  assert.doesNotMatch(periodSelect, /min-w-\[280px\]/);
});
