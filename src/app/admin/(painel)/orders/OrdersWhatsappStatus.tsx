"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircleMore, WifiOff } from "lucide-react";

type WhatsappConnectionState = "checking" | "connected" | "disconnected";

function resolveConnectionState(status: unknown): WhatsappConnectionState {
  const normalized = String(status || "").trim().toLowerCase();
  return ["connected", "conectado", "ready", "open"].includes(normalized)
    ? "connected"
    : "disconnected";
}

export function OrdersWhatsappStatus() {
  const router = useRouter();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<WhatsappConnectionState>("checking");

  useEffect(() => {
    const syncHeaderState = () => {
      const nextTarget = document.querySelector<HTMLElement>(
        ".admin-page-header-action > div",
      );
      if (nextTarget) setTarget(nextTarget);
      setIsDrawerOpen(Boolean(document.querySelector(".orders-drawer-open")));
    };

    syncHeaderState();
    const observer = new MutationObserver(syncHeaderState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const response = await fetch("/api/whatsapp-bot/status", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        setConnectionState(response.ok ? resolveConnectionState(payload.status) : "disconnected");
      } catch {
        if (!cancelled) setConnectionState("disconnected");
      }
    };

    void checkStatus();
    const intervalId = window.setInterval(checkStatus, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const presentation = useMemo(() => {
    if (connectionState === "connected") {
      return {
        label: "WhatsApp conectado",
        title: "WhatsApp conectado",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: <MessageCircleMore size={17} />,
      };
    }

    if (connectionState === "checking") {
      return {
        label: "Verificando WhatsApp",
        title: "Verificando conexão do WhatsApp",
        className: "border-gray-200 bg-white text-gray-500",
        icon: <Loader2 size={17} className="animate-spin" />,
      };
    }

    return {
      label: "WhatsApp desconectado",
      title: "WhatsApp desconectado. Clique para reconectar pelo QR Code.",
      className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
      icon: <WifiOff size={17} />,
    };
  }, [connectionState]);

  if (!target) return null;

  const compactClasses = isDrawerOpen
    ? "xl:h-11 xl:w-11 xl:min-w-11 xl:flex-none xl:gap-0 xl:px-0"
    : "";

  return createPortal(
    <button
      type="button"
      disabled={connectionState !== "disconnected"}
      onClick={() => router.push("/admin/settings?section=whatsapp")}
      title={presentation.title}
      aria-label={presentation.title}
      className={`orders-whatsapp-status inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition sm:flex-none disabled:cursor-default ${compactClasses} ${presentation.className}`}
    >
      {presentation.icon}
      <span className={isDrawerOpen ? "xl:hidden" : ""}>{presentation.label}</span>
    </button>,
    target,
  );
}
