"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "../src/features/onboarding/navigation.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(compiled, sourcePath);
const { getNextSetupStep, shouldRefreshSetupOnFocus } = mod.exports;

test("setup action prioritizes the first incomplete saved section", () => {
  const steps = [
    { id: "identity", status: "complete", href: "/admin/settings" },
    { id: "operations", status: "incomplete", href: "/admin/settings" },
    { id: "payments", status: "incomplete", href: "/admin/settings/payments" }
  ];
  assert.equal(getNextSetupStep({ steps }), steps[1]);
});
test("completed checklist has no next action", () => {
  assert.equal(getNextSetupStep({ steps: [{ status: "complete" }] }), null);
});
test("empty checklist has no next action", () => {
  assert.equal(getNextSetupStep({ steps: [] }), null);
});
test("refresh only when tab becomes visible", () => {
  assert.equal(shouldRefreshSetupOnFocus("visible"), true);
  assert.equal(shouldRefreshSetupOnFocus("hidden"), false);
});
