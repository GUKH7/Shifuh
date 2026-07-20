import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCep,
  formatCurrencyInput,
  formatPhone,
  getChangeForError,
  isStorefrontPaymentMethod,
  isValidCep,
  isValidPhone,
  parseCurrencyInput,
} from "../src/features/storefront/checkout-format.ts";

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

test("formats and validates cash change", () => {
  assert.equal(formatCurrencyInput("5000"), "R$ 50,00");
  assert.equal(parseCurrencyInput("R$ 50,00"), 50);
  assert.equal(getChangeForError("R$ 50,00", 42.5), "");
  assert.match(getChangeForError("R$ 40,00", 42.5), /maior que o total/i);
});

test("accepts only supported storefront payment methods", () => {
  assert.equal(isStorefrontPaymentMethod("pix"), true);
  assert.equal(isStorefrontPaymentMethod("credit"), true);
  assert.equal(isStorefrontPaymentMethod("card"), false);
});
