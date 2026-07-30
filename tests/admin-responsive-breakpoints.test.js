const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const responsive = fs.readFileSync("src/app/admin/(painel)/admin-responsive.css", "utf8");

test("stylesheet define breakpoints sem depender de classes Tailwind", () => {
  assert.match(responsive, /@media \(max-width: 639px\)/);
  assert.match(responsive, /@media \(max-width: 767px\)/);
  assert.match(responsive, /@media \(max-width: 1023px\)/);
  assert.doesNotMatch(responsive, /\[class\*=/);
  assert.doesNotMatch(responsive, /nth-child|first-child|last-child|:has/);
});
