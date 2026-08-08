"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, WalletCards } from "lucide-react";

export function SettingsNavigation() {
  const pathname = usePathname();
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/admin/settings") {
      setMountNode(null);
      return;
    }

    const firstServiceRule = document.getElementById("orders");
    if (!firstServiceRule?.parentElement) return;

    const host = document.createElement("div");
    host.className = "settings-payments-shortcut";
    firstServiceRule.parentElement.insertBefore(host, firstServiceRule);
    setMountNode(host);

    return () => {
      setMountNode(null);
      host.remove();
    };
  }, [pathname]);

  if (pathname !== "/admin/settings" || !mountNode) return null;

  return createPortal(
    <Link
      href="/admin/settings/payments"
      className="surface-card flex items-center justify-between gap-4 rounded-[28px] p-4 transition-colors hover:bg-[#fcfaf7] sm:p-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">
          <WalletCards size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-black text-gray-950">Formas de pagamento</h3>
          <p className="text-sm text-gray-500">
            Configure Pix, dinheiro e cartões disponíveis para o cliente.
          </p>
        </div>
      </div>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-gray-500">
        <ChevronRight size={18} />
      </span>
    </Link>,
    mountNode,
  );
}
