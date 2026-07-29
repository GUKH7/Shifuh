const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const componentPath = path.join(root, "src/components/ui/live-status-dot.tsx");
const componentSource = fs.readFileSync(componentPath, "utf8");

test("indicador em tempo real usa animação SVG própria e visível", () => {
  assert.match(componentSource, /<svg/);
  assert.match(componentSource, /overflow-visible/);
  assert.match(componentSource, /<animate/);
  assert.match(componentSource, /values="4\.5;11"/);
  assert.match(componentSource, /values="0\.55;0"/);
  assert.match(componentSource, /dur="1\.35s"/);
  assert.match(componentSource, /repeatCount="indefinite"/);
});

test("indicador não depende de animações CSS utilitárias", () => {
  assert.doesNotMatch(componentSource, /animate-ping/);
  assert.doesNotMatch(componentSource, /@keyframes/);
  assert.doesNotMatch(componentSource, /live-status-dot\.module\.css/);
});
