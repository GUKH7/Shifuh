import assert from "node:assert/strict";
import test from "node:test";

import { formatCep, formatPhone, isValidCep, isValidPhone } from "../src/features/storefront/checkout-format.ts";

test("formats and validates Brazilian phone numbers", () => {
  assert.equal(formatPhone("11987654321"), "(11) 98765-4321");
  assert.equal(isValidPhone("(11) 98765-4321"), true);
  assert.equal(isValidPhone("1234"), false);
});

test("formats and validates CEP", () => {
  assert.equal(formatCep("08693290"), "08693-290");
  assert.equal(isValidCep("08693-290"), true);
  assert.equal(isValidCep("08693"), false);
});
