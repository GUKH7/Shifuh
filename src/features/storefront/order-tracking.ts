import type { PublicOrderStatus } from "./types";

export const ORDER_STATUS_DETAILS: Record<
  PublicOrderStatus,
  { label: string; message: string; step: number }
> = {
  pending: {
    label: "Aguardando confirmação",
    message: "O pedido foi registrado e aguarda a confirmação do restaurante.",
    step: 0,
  },
  preparing: {
    label: "Pedido aceito",
    message: "O restaurante aceitou seu pedido e já iniciou o preparo.",
    step: 1,
  },
  delivering: {
    label: "Saiu para entrega",
    message: "Seu pedido está a caminho do endereço informado.",
    step: 2,
  },
  done: {
    label: "Pedido concluído",
    message: "A entrega foi concluída. Bom apetite!",
    step: 3,
  },
  canceled: {
    label: "Pedido cancelado",
    message: "O pedido foi cancelado. Entre em contato com a loja se precisar de ajuda.",
    step: -1,
  },
};

export function normalizePublicOrderStatus(status: string): PublicOrderStatus {
  if (status === "preparing" || status === "delivering" || status === "done" || status === "canceled") {
    return status;
  }

  return "pending";
}

export function isOrderInProgress(status: PublicOrderStatus) {
  return status === "pending" || status === "preparing" || status === "delivering";
}
