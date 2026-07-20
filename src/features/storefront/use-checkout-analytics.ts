"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CheckoutStep } from "./types";

type CheckoutEventType =
  | "checkout_opened"
  | "step_viewed"
  | "checkout_abandoned"
  | "checkout_error"
  | "order_completed";

type UseCheckoutAnalyticsOptions = {
  restaurantId?: string;
  isOpen: boolean;
  step: CheckoutStep;
  cartQuantity: number;
};

function getSessionId(restaurantId: string) {
  const key = `gestor-delivery:checkout-session:${restaurantId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

export function useCheckoutAnalytics({
  restaurantId,
  isOpen,
  step,
  cartQuantity,
}: UseCheckoutAnalyticsOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);
  const completedRef = useRef(false);
  const lastStepRef = useRef<CheckoutStep>("cart");

  const send = useCallback((eventType: CheckoutEventType, eventStep: CheckoutStep, reason?: string) => {
    if (!restaurantId || typeof window === "undefined") return;
    sessionIdRef.current ||= getSessionId(restaurantId);
    const payload = JSON.stringify({
      restaurantId,
      sessionId: sessionIdRef.current,
      eventType,
      step: eventStep,
      reason,
    });

    if (eventType === "checkout_abandoned" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/storefront/checkout-events", new Blob([payload], { type: "application/json" }));
      return;
    }

    void fetch("/api/storefront/checkout-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [restaurantId]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current && cartQuantity > 0) {
      completedRef.current = false;
      send("checkout_opened", step);
      send("step_viewed", step);
    } else if (isOpen && wasOpenRef.current && step !== lastStepRef.current) {
      send("step_viewed", step);
    } else if (!isOpen && wasOpenRef.current && !completedRef.current && cartQuantity > 0) {
      send("checkout_abandoned", lastStepRef.current, "drawer_closed");
    }

    wasOpenRef.current = isOpen;
    lastStepRef.current = step;
  }, [cartQuantity, isOpen, send, step]);

  useEffect(() => {
    const handlePageHide = () => {
      if (wasOpenRef.current && !completedRef.current && cartQuantity > 0) {
        send("checkout_abandoned", lastStepRef.current, "page_hidden");
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [cartQuantity, send]);

  const markCompleted = useCallback(() => {
    completedRef.current = true;
    send("order_completed", lastStepRef.current);
  }, [send]);

  const trackError = useCallback((reason: string) => {
    send("checkout_error", lastStepRef.current, reason);
  }, [send]);

  return { markCompleted, trackError };
}
