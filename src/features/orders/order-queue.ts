import type { Order } from "./types";
import { is99FoodOrder } from "@/lib/integrations/order-channels";

/** Oldest pending order due now. Future scheduled orders are not fast-tracked. */
export function selectNextPendingOrder(orders: readonly Order[], now: Date): Order | null {
  let selected: Order | null = null;
  let oldest = Number.POSITIVE_INFINITY;
  const currentTime = now.getTime();

  for (const order of orders) {
    if (order.status !== "pending" || is99FoodOrder(order)) continue;
    if (order.scheduled_for) {
      const scheduledTime = Date.parse(order.scheduled_for);
      if (!Number.isFinite(scheduledTime) || scheduledTime > currentTime) continue;
    }

    const parsed = Date.parse(order.created_at);
    const createdAt = Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    if (!selected || createdAt < oldest || (createdAt === oldest && order.id < selected.id)) {
      selected = order;
      oldest = createdAt;
    }
  }

  return selected;
}
