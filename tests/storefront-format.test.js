import assert from "node:assert/strict";
import test from "node:test";

import { getContrastTextColor } from "../src/features/storefront/format.ts";

test("chooses readable text for restaurant brand colors", () => {
  assert.equal(getContrastTextColor("#ffeb3b"), "#111827");
  assert.equal(getContrastTextColor("#7f0000"), "#ffffff");
  assert.equal(getContrastTextColor("invalid"), "#ffffff");
});
