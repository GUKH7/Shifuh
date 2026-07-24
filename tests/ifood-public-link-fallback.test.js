const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const route = fs.readFileSync(
  "src/app/api/integrations/ifood/public-link/import/route.ts",
  "utf8",
);

test("importação por link usa fallback quando a página pública é bloqueada", () => {
  assert.match(route, /catch \(pageError\)/);
  assert.match(route, /scrapeIfoodPublicMenu\(canonicalPublicUrl\)/);
  assert.match(route, /normalizedPublicUrl\.search = ""/);
  assert.doesNotMatch(
    route,
    /const imported = await fetchIfoodPublicStoreData\(publicUrl\)/,
  );
});
