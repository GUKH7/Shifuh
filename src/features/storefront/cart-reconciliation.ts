import type { CartItem, Product } from "./types";
import { getAddonGroupLimits } from "./product-options";

export type CartReconciliation = {
  items: CartItem[];
  removedCount: number;
  repricedCount: number;
};

// The browser's saved cart is untrusted and may contain prices or products
// that the restaurant has since paused or changed. Never reuse stored totals.
export function reconcilePersistedCart(saved: unknown, catalog: Product[]): CartReconciliation {
  const currentProducts = new Map(catalog.filter((p) => p?.is_active === true).map((p) => [p.id, p]));
  const items: CartItem[] = [];
  let removedCount = 0;
  let repricedCount = 0;

  if (!Array.isArray(saved)) return { items, removedCount, repricedCount };

  for (const entry of saved) {
    if (!entry || typeof entry !== "object") {
      removedCount++;
      continue;
    }

    const old = entry as Partial<CartItem>;
    const product = typeof old.product?.id === "string" ? currentProducts.get(old.product.id) : null;
    const quantity = Number(old.quantity);
    if (
      !product ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999 ||
      typeof old.internalId !== "string" ||
      !Array.isArray(old.selectedAddons) ||
      !Number.isFinite(Number(product.price)) ||
      Number(product.price) < 0
    ) {
      removedCount++;
      continue;
    }

    const groups = Array.isArray(product.addons) ? product.addons : [];
    const currentSelections = new Map<string, Array<{ groupId: string; name: string; price: number }>>();
    let invalid = false;

    for (const selected of old.selectedAddons) {
      if (!selected || typeof selected.name !== "string") {
        invalid = true;
        break;
      }
      // Legacy carts may not carry a group ID. Only recover if the option name
      // occurs in exactly one current group; ambiguity must not change pricing.
      const matchingGroups = groups.filter((group: any) =>
        group?.is_active !== false &&
        Array.isArray(group.options) &&
        group.options.some((option: any) => option?.is_active !== false && option.name === selected.name),
      );
      const group = selected.groupId
        ? matchingGroups.find((candidate: any) => String(candidate.id) === String(selected.groupId))
        : matchingGroups.length === 1 ? matchingGroups[0] : null;
      const option = group?.options?.find((candidate: any) =>
        candidate?.is_active !== false && candidate.name === selected.name,
      );
      const groupId = group ? String(group.id) : "";
      const optionPrice = Number(option?.price ?? 0);
      const previous = currentSelections.get(groupId) || [];
      if (!groupId || !option || !Number.isFinite(optionPrice) || optionPrice < 0 ||
          previous.some((candidate) => candidate.name === selected.name)) {
        invalid = true;
        break;
      }
      currentSelections.set(groupId, [...previous, { groupId, name: option.name, price: optionPrice }]);
    }

    const selectedAddons: CartItem["selectedAddons"] = [];
    for (const group of groups) {
      const groupId = String(group.id);
      const options = currentSelections.get(groupId) || [];
      const { minimum, maximum } = getAddonGroupLimits(group);
      if (group?.is_active === false ? options.length > 0 :
          options.length < minimum || (maximum > 0 && options.length > maximum)) {
        invalid = true;
      }
      selectedAddons.push(...options);
    }

    if (invalid) {
      removedCount++;
      continue;
    }

    const unitPrice = Number(product.price) + selectedAddons.reduce(
      (total, addon) => total + Number(addon.price ?? 0), 0,
    );
    const totalPrice = Math.round(unitPrice * quantity * 100) / 100;
    if (Math.abs(Number(old.totalPrice) - totalPrice) > 0.005 ||
        !Number.isFinite(Number(old.totalPrice))) {
      repricedCount++;
    }
    items.push({
      internalId: old.internalId,
      product,
      quantity,
      selectedAddons,
      totalPrice,
      observation: typeof old.observation === "string" ? old.observation : "",
    });
  }

  return { items, removedCount, repricedCount };
}
