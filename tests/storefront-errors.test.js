import assert from "node:assert/strict";
import test from "node:test";

import { getFriendlyStorefrontError } from "../src/features/storefront/errors.ts";

test("never exposes technical payloads in storefront errors", () => {
  for (const context of ["cep", "delivery", "order", "tracking"]) {
    const message = getFriendlyStorefrontError(context);
    assert.equal(message.includes("{"), false);
    assert.equal(message.includes("JSON"), false);
    assert.equal(message.includes("stack"), false);
  }
});
