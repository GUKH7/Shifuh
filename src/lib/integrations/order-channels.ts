/**
 * The 99Food source is recognized for display only until the official
 * connector has been authorized and homologated. Never fall back to a local
 * status mutation for orders owned by that marketplace.
 */
export type ExternalOrderSource = {
  external_source?: string | null;
};

export function is99FoodOrder(order: ExternalOrderSource): boolean {
  return typeof order.external_source === "string" &&
    order.external_source.trim().toLowerCase() === "99food";
}

/** Channel identity is scoped by marketplace, store and upstream order ID. */
export function getExternalOrderIdentity(
  restaurantId: string,
  source: "ifood" | "99food",
  externalOrderId: string,
): string {
  if (!restaurantId.trim() || !externalOrderId.trim()) {
    throw new Error("A loja e o identificador externo do pedido são obrigatórios.");
  }

  // JSON encoding avoids ambiguous separators or collisions in provider IDs.
  return JSON.stringify([restaurantId, source, externalOrderId]);
}
