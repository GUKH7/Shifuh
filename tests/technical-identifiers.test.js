const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

test("package raiz usa a identidade tecnica Shifuh", () => {
  assert.equal(packageJson.name, "shifuh");
  assert.equal(packageLock.name, "shifuh");
  assert.equal(packageLock.packages?.[""]?.name, "shifuh");
});

test("CI nao depende do nome legado do repositorio ou projeto Vercel", () => {
  assert.doesNotMatch(ci, /gestor[_-]delivery/i);
  assert.match(ci, /actions\/checkout@v4/);
});
