import assert from "node:assert/strict";
import test from "node:test";

import {
  getAddonSelectionInstruction,
  toggleAddonSelection,
} from "../src/features/storefront/product-options.ts";

test("describes addon limits using customer-friendly language", () => {
  assert.equal(getAddonSelectionInstruction({ min_options: 0, max_options: 2 }), "Escolha até 2");
  assert.equal(getAddonSelectionInstruction({ min_options: 1, max_options: 0 }), "Escolha pelo menos 1");
  assert.equal(getAddonSelectionInstruction({ min_options: 1, max_options: 1 }), "Escolha 1 opção");
});

test("single-choice groups replace the previous option", () => {
  assert.deepEqual(
    toggleAddonSelection([{ name: "Pequena" }], { name: "Grande" }, { max_options: 1 }),
    [{ name: "Grande" }],
  );
});

test("multiple-choice groups respect their maximum", () => {
  const current = [{ name: "A" }, { name: "B" }];
  assert.equal(toggleAddonSelection(current, { name: "C" }, { max_options: 2 }), current);
});
