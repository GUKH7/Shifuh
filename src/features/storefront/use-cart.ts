"use client";

import { useMemo, useState } from "react";
import type { CartItem, Product } from "./types";

export function useCart() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addonSelections, setAddonSelections] = useState<Record<string, any[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setObservation("");
    setAddonSelections({});
  };

  const closeProduct = () => setSelectedProduct(null);

  const toggleAddon = (groupId: string, option: any, group: any) => {
    setAddonSelections((prev) => {
      const current = prev[groupId] || [];
      const exists = current.some((item) => item.name === option.name);

      if (exists) {
        return { ...prev, [groupId]: current.filter((item) => item.name !== option.name) };
      }

      if (group.max_options > 0 && current.length >= group.max_options) return prev;

      return { ...prev, [groupId]: [...current, option] };
    });
  };

  const calculateProductTotal = () => {
    if (!selectedProduct) return 0;

    let total = selectedProduct.price;
    Object.values(addonSelections).forEach((options) =>
      options.forEach((option) => {
        total += option.price || 0;
      }),
    );

    return total * quantity;
  };

  const addToCart = () => {
    if (!selectedProduct) return;

    const selectedAddonEntries = Object.entries(addonSelections).flatMap(([groupId, options]) =>
      options.map((option) => ({
        ...option,
        groupId,
      })),
    );

    setCart((current) => [
      ...current,
      {
        internalId: Date.now().toString(),
        product: selectedProduct,
        quantity,
        selectedAddons: selectedAddonEntries,
        totalPrice: calculateProductTotal(),
        observation,
      },
    ]);
    setSelectedProduct(null);
  };

  const removeFromCart = (id: string) => {
    setCart((current) => current.filter((item) => item.internalId !== id));
  };

  const clearCart = () => setCart([]);

  const cartSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.totalPrice, 0),
    [cart],
  );

  return {
    selectedProduct,
    addonSelections,
    quantity,
    observation,
    cart,
    cartSubtotal,
    setQuantity,
    setObservation,
    setCart,
    openProduct,
    closeProduct,
    toggleAddon,
    calculateProductTotal,
    addToCart,
    removeFromCart,
    clearCart,
  };
}
