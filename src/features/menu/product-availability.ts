/** Visibility in the public storefront requires both the product and its category active. */
export type MenuAvailabilityFilter = "all" | "available" | "unavailable";

type AvailabilityState = { is_active?: boolean | null };

export function isMenuProductAvailable(
  product: AvailabilityState | null | undefined,
  category: AvailabilityState | null | undefined,
): boolean {
  return product?.is_active === true && category?.is_active === true;
}

export function matchesMenuAvailabilityFilter(
  product: AvailabilityState | null | undefined,
  category: AvailabilityState | null | undefined,
  filter: MenuAvailabilityFilter,
): boolean {
  if (filter === "all") return true;
  const available = isMenuProductAvailable(product, category);
  return filter === "available" ? available : !available;
}
