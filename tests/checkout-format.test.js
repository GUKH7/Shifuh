import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCep,
  formatCurrencyInput,
  formatPhone,
  getCheckoutAddressErrors,
  getChangeForError,
  isCompleteCheckoutAddress,
  isStorefrontPaymentMethod,
  isValidCep,
  isValidPhone,
  paymentMethodDetails,
  parseCurrencyInput,
} from "../src/features/checkout/checkout-format.ts";

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

test("validates every required delivery address field and Brazilian state", () => {
  const completeAddress = {
    cep: "08693-290",
    street: "Rua Tito Prates",
    number: "66",
    neighborhood: "Cidade Boa Vista",
    city: "Suzano",
    state: "SP",
  };

  assert.equal(isCompleteCheckoutAddress(completeAddress), true);
  assert.deepEqual(getCheckoutAddressErrors(completeAddress), {
    cep: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  assert.match(getCheckoutAddressErrors({ ...completeAddress, city: "", state: "XX" }).city, /cidade/i);
  assert.match(getCheckoutAddressErrors({ ...completeAddress, state: "XX" }).state, /UF válida/i);
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
  assert.equal(paymentMethodDetails.credit.label, "CRÉDITO");
  assert.equal(paymentMethodDetails.debit.label, "DÉBITO");
});
