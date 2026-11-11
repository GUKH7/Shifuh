"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const picker = fs.readFileSync(path.join(root, "src/features/storefront/catalog/ProductPicker.tsx"), "utf8");

test("mobile picker guides missing required addon selection instead of leaving a dead-end CTA", () => {
  assert.match(picker, /const missingRequiredGroups = product\.addons\?\.filter/);
  assert.match(picker, /const handlePrimaryAction = \(\) => \{/);
  assert.match(picker, /if \(missingRequiredGroups\.length === 0\) \{\s*onAddToCart\(\)/);
  assert.match(picker, /firstMissing = missingRequiredGroups\[0\]/);
  assert.match(picker, /target\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(picker, /target\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(picker, /onClick=\{handlePrimaryAction\}/);
  assert.match(picker, /"Escolher opções"/);
});

test("addon groups remain focusable and mobile controls respect accessible hit targets", () => {
  assert.match(picker, /data-addon-group=\{group\.id\}/);
  assert.match(picker, /tabIndex=\{-1\}/);
  assert.match(picker, /scroll-mt-5/);
  assert.match(picker, /disabled=\{quantity <= 1\}/);
  assert.match(picker, /text-base outline-none sm:text-sm/);
  assert.match(picker, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
});

test("product picker does not alter the order API or database and preview stays disabled", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.equal(config.git.deploymentEnabled.main, false);
  assert.equal(config.git.deploymentEnabled["feat/mobile-purchase-ux-20261111"], false);
});
