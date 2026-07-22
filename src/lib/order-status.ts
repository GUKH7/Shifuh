export type OrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: "Pendente", badge: "border-orange-200 bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  preparing: { label: "Em preparo", badge: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  delivering: { label: "Em rota", badge: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  done: { label: "Concluído", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  canceled: { label: "Cancelado", badge: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
};

export function getOrderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_META[status].label;
}
