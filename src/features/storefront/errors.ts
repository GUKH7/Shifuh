export type StorefrontErrorContext = "cep" | "delivery" | "order" | "tracking";

const FRIENDLY_MESSAGES: Record<StorefrontErrorContext, string> = {
  cep: "Não conseguimos consultar este CEP. Confira os números ou preencha o endereço manualmente.",
  delivery: "Não conseguimos calcular a entrega agora. Confira o endereço e tente novamente.",
  order: "Não conseguimos enviar seu pedido agora. Sua sacola foi mantida; tente novamente em instantes.",
  tracking: "Não conseguimos atualizar o pedido agora. Tente novamente em instantes.",
};

export function getFriendlyStorefrontError(context: StorefrontErrorContext) {
  return FRIENDLY_MESSAGES[context];
}
