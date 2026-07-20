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

export function getOrderApiErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    STORE_CLOSED: "A loja está fechada e não está recebendo pedidos agora.",
    MINIMUM_ORDER_NOT_REACHED: "Adicione mais itens para atingir o pedido mínimo.",
    SCHEDULING_DISABLED: "Esta loja não está aceitando pedidos agendados.",
    INVALID_SCHEDULE: "Escolha uma data e um horário dentro do funcionamento da loja.",
    INVALID_PAYMENT_METHOD: "Escolha uma forma de pagamento para continuar.",
    INVALID_CHANGE_FOR: "Confira o valor informado para o troco.",
    INCOMPLETE_ADDRESS: "Complete CEP, rua, número, bairro, cidade e UF.",
    ADDRESS_NOT_FOUND: "Não localizamos este endereço. Confira os campos e tente novamente.",
    OUTSIDE_DELIVERY_AREA: "Este endereço está fora da área atendida pela loja.",
    DELIVERY_CALCULATION_UNAVAILABLE: "Não conseguimos recalcular a entrega agora. Seus dados foram mantidos; tente novamente.",
    ORDER_CREATION_FAILED: "Não conseguimos registrar o pedido. Sua sacola foi mantida para você tentar novamente.",
  };

  return (code && messages[code]) || FRIENDLY_MESSAGES.order;
}
