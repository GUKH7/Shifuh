const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const componentPath = path.join(root, "src/components/ui/live-status-dot.tsx");
const cssPath = path.join(root, "src/components/ui/live-status-dot.module.css");

const componentSource = fs.readFileSync(componentPath, "utf8");
const cssSource = fs.readFileSync(cssPath, "utf8");

test("indicador em tempo real usa animação própria e visível", () => {
  assert.match(componentSource, /import styles from "\.\/live-status-dot\.module\.css"/);
  assert.match(componentSource, /className=\{styles\.pulse\}/);
  assert.match(componentSource, /className=\{styles\.core\}/);
  assert.match(cssSource, /@keyframes live-status-pulse/);
  assert.match(cssSource, /animation: live-status-pulse 1\.45s/);
  assert.match(cssSource, /overflow: visible/);
});

test("indicador não depende mais da animação utilitária que podia ser desativada", () => {
  assert.doesNotMatch(componentSource, /animate-ping/);
  assert.doesNotMatch(componentSource, /motion-reduce:animate-none/);
});
