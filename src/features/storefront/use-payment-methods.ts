"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  defaultStorefrontPaymentMethods,
  normalizeStorefrontPaymentMethods,
  type StorefrontPaymentMethod,
} from "./checkout-format";

export function useStorefrontPaymentMethods() {
  const pathname = usePathname();
  const [paymentMethods, setPaymentMethods] = useState<StorefrontPaymentMethod[]>(
    defaultStorefrontPaymentMethods,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = pathname.split("/").filter(Boolean)[0] || "";
    if (!slug) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadPaymentMethods = async () => {
      try {
        const response = await fetch(
          `/api/storefront/payment-methods?slug=${encodeURIComponent(slug)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));

        if (response.ok) {
          setPaymentMethods(normalizeStorefrontPaymentMethods(payload.paymentMethods));
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Falha ao carregar formas de pagamento:", error);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPaymentMethods();
    return () => controller.abort();
  }, [pathname]);

  return { paymentMethods, loading };
}
