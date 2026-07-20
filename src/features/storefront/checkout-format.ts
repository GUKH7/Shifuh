export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidPhone(value: string) {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function isValidCep(value: string) {
  return onlyDigits(value).length === 8;
}

const BRAZILIAN_STATE_CODES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

export type CheckoutAddressFields = {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export function getCheckoutAddressErrors(address: CheckoutAddressFields) {
  const state = address.state?.trim().toUpperCase() || "";

  return {
    cep: isValidCep(address.cep || "") ? "" : "Informe um CEP com 8 números.",
    street: (address.street?.trim().length || 0) >= 3 ? "" : "Informe a rua.",
    number: address.number?.trim() ? "" : "Informe o número.",
    neighborhood: (address.neighborhood?.trim().length || 0) >= 2 ? "" : "Informe o bairro.",
    city: (address.city?.trim().length || 0) >= 2 ? "" : "Informe a cidade.",
    state: BRAZILIAN_STATE_CODES.has(state) ? "" : "Informe uma UF válida.",
  };
}

export function isCompleteCheckoutAddress(address: CheckoutAddressFields) {
  return !Object.values(getCheckoutAddressErrors(address)).some(Boolean);
}

export const storefrontPaymentMethods = ["pix", "credit", "debit", "cash"] as const;

export type StorefrontPaymentMethod = (typeof storefrontPaymentMethods)[number];

export const paymentMethodDetails: Record<
  StorefrontPaymentMethod,
  { label: string; description: string; timing: string }
> = {
  pix: {
    label: "Pix",
    description: "Use a chave ou o QR Code informado pela loja.",
    timing: "Pagamento na entrega",
  },
  credit: {
    label: "Crédito",
    description: "Pagamento na maquininha do entregador.",
    timing: "Pagamento na entrega",
  },
  debit: {
    label: "Débito",
    description: "Pagamento na maquininha do entregador.",
    timing: "Pagamento na entrega",
  },
  cash: {
    label: "Dinheiro",
    description: "Pague ao receber o pedido.",
    timing: "Pagamento na entrega",
  },
};

export function isStorefrontPaymentMethod(value: unknown): value is StorefrontPaymentMethod {
  return typeof value === "string" && storefrontPaymentMethods.includes(value as StorefrontPaymentMethod);
}

export function formatCurrencyInput(value: string) {
  const cents = Number(onlyDigits(value));
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function parseCurrencyInput(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getChangeForError(changeFor: string, orderTotal: number) {
  const amount = parseCurrencyInput(changeFor);
  if (amount === null || amount <= 0) return "Informe o valor que será entregue em dinheiro.";
  if (amount <= orderTotal) return "O valor para troco deve ser maior que o total do pedido.";
  return "";
}
