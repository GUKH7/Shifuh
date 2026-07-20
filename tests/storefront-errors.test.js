import assert from "node:assert/strict";
import test from "node:test";

import { getFriendlyStorefrontError, getOrderApiErrorMessage } from "../src/features/storefront/errors.ts";

test("never exposes technical payloads in storefront errors", () => {
  for (const context of ["cep", "delivery", "order", "tracking"]) {
    const message = getFriendlyStorefrontError(context);
    assert.equal(message.includes("{"), false);
    assert.equal(message.includes("JSON"), false);
    assert.equal(message.includes("stack"), false);
  }
});

test("maps operational order failures without exposing server details", () => {
  for (const code of [
    "STORE_CLOSED",
    "MINIMUM_ORDER_NOT_REACHED",
    "SCHEDULING_DISABLED",
    "INVALID_SCHEDULE",
    "INVALID_PAYMENT_METHOD",
    "INVALID_CHANGE_FOR",
    "ORDER_CREATION_FAILED",
    "UNKNOWN_CODE",
  ]) {
    const message = getOrderApiErrorMessage(code);
    assert.equal(message.includes("{"), false);
    assert.equal(message.includes("stack"), false);
    assert.ok(message.length > 20);
  }
});
