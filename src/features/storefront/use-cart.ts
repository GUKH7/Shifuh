"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "./types";
import { toggleAddonSelection } from "./product-options";

export function useCart(storageKey: string) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addonSelections, setAddonSelections] = useState<Record<string, any[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState("");
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem(storageKey);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch (error) {
      console.warn("Não foi possível restaurar a sacola.", error);
    } finally {
      setCartHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!cartHydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch (error) {
      console.warn("Não foi possível salvar a sacola.", error);
    }
  }, [cart, cartHydrated, storageKey]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setObservation("");
    setAddonSelections({});
    setEditingCartItemId(null);
  };

  const editCartItem = (item: CartItem) => {
    const selections = item.selectedAddons.reduce<Record<string, any[]>>((groups, addon) => {
      const groupId = addon.groupId || item.product.addons?.find((group: any) =>
        group.options?.some((option: any) => option.name === addon.name),
      )?.id;
      if (!groupId) return groups;
      groups[groupId] = [...(groups[groupId] || []), addon];
      return groups;
    }, {});
    setSelectedProduct(item.product);
    setQuantity(item.quantity);
    setObservation(item.observation || "");
    setAddonSelections(selections);
    setEditingCartItemId(item.internalId);
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setEditingCartItemId(null);
  };

  const toggleAddon = (groupId: string, option: any, group: any) => {
    setAddonSelections((prev) => {
      const current = prev[groupId] || [];
      const next = toggleAddonSelection(current, option, group);
      return next === current ? prev : { ...prev, [groupId]: next };
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

    const hasMissingRequiredGroup = selectedProduct.addons?.some((group: any) => {
      const minimum = Number(group.min_options ?? (group.required ? 1 : 0));
      return (addonSelections[group.id]?.length || 0) < minimum;
    });
    if (hasMissingRequiredGroup) return;

    const selectedAddonEntries = Object.entries(addonSelections).flatMap(([groupId, options]) =>
      options.map((option) => ({
        ...option,
        groupId,
      })),
    );

    const nextItem = {
        internalId: Date.now().toString(),
        product: selectedProduct,
        quantity,
        selectedAddons: selectedAddonEntries,
        totalPrice: calculateProductTotal(),
        observation,
      };

    setCart((current) =>
      editingCartItemId
        ? current.map((item) =>
            item.internalId === editingCartItemId
              ? { ...nextItem, internalId: editingCartItemId }
              : item,
          )
        : [...current, nextItem],
    );
    setSelectedProduct(null);
    setEditingCartItemId(null);
  };

  const removeFromCart = (id: string) => {
    setCart((current) => current.filter((item) => item.internalId !== id));
  };

  const updateCartItemQuantity = (id: string, nextQuantity: number) => {
    if (nextQuantity < 1) {
      removeFromCart(id);
      return;
    }

    setCart((current) =>
      current.map((item) => {
        if (item.internalId !== id) return item;
        const addonTotal = item.selectedAddons.reduce(
          (total, addon) => total + Number(addon.price || 0),
          0,
        );
        return {
          ...item,
          quantity: nextQuantity,
          totalPrice: (Number(item.product.price) + addonTotal) * nextQuantity,
        };
      }),
    );
  };

  const clearCart = () => setCart([]);

  const cartSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.totalPrice, 0),
    [cart],
  );
  const cartQuantity = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  );

  return {
    selectedProduct,
    addonSelections,
    quantity,
    observation,
    editingCartItemId,
    cart,
    cartSubtotal,
    cartQuantity,
    setQuantity,
    setObservation,
    setCart,
    openProduct,
    editCartItem,
    closeProduct,
    toggleAddon,
    calculateProductTotal,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
  };
}
