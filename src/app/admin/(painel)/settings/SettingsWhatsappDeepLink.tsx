"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SettingsWhatsappDeepLink() {
  const searchParams = useSearchParams();
  const shouldOpenWhatsapp = searchParams.get("section") === "whatsapp";

  useEffect(() => {
    if (!shouldOpenWhatsapp) return;

    let stopped = false;
    let timeoutId: number | undefined;

    const openWhatsappSection = () => {
      if (stopped) return true;

      const heading = Array.from(document.querySelectorAll("h2")).find(
        (element) => element.textContent?.trim() === "WhatsApp automático",
      );
      const section = heading?.closest("section");
      const toggle = section?.querySelector<HTMLButtonElement>("button[aria-expanded]");

      if (!section || !toggle) return false;

      if (toggle.getAttribute("aria-expanded") !== "true") {
        toggle.click();
      }

      window.requestAnimationFrame(() => {
        section.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return true;
    };

    if (openWhatsappSection()) return;

    const observer = new MutationObserver(() => {
      if (openWhatsappSection()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    timeoutId = window.setTimeout(() => observer.disconnect(), 12_000);

    return () => {
      stopped = true;
      observer.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [shouldOpenWhatsapp]);

  return null;
}
