const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const sidebar = fs.readFileSync("src/components/admin-sidebar.tsx", "utf8");

test("ações da sidebar recebem cor somente no hover ou foco", () => {
  assert.match(
    sidebar,
    /bg-white[\s\S]*hover:bg-\[#171311\][\s\S]*focus-visible:bg-\[#171311\]/,
  );
  assert.match(
    sidebar,
    /bg-white[\s\S]*hover:bg-red-600[\s\S]*focus-visible:bg-red-600/,
  );
  assert.doesNotMatch(sidebar, /border-red-700 bg-red-600/);
  assert.doesNotMatch(sidebar, /shrink-0 text-white/);
});
