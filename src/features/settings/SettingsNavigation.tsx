"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, WalletCards } from "lucide-react";

export function SettingsNavigation() {
  const pathname = usePathname();

  if (pathname !== "/admin/settings") return null;

  return (
    <div className="settings-payments-shortcut px-3 pb-20 sm:px-4 md:px-5 lg:px-6">
      <div className="admin-page-shell">
        <div className="px-1 pt-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Pagamentos
          </p>
          <h2 className="mt-1 text-lg font-black text-gray-950">Formas de pagamento</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Defina quais opções o cliente poderá selecionar ao finalizar o pedido na vitrine.
          </p>
        </div>

        <Link
          href="/admin/settings/payments"
          className="surface-card mt-5 flex items-center justify-between gap-4 rounded-[28px] p-4 transition-colors hover:bg-[#fcfaf7] sm:p-6"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">
              <WalletCards size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-black text-gray-950">Métodos aceitos</h3>
              <p className="text-sm text-gray-500">
                Configure Pix, dinheiro e cartões disponíveis para o cliente.
              </p>
            </div>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-gray-500">
            <ChevronRight size={18} />
          </span>
        </Link>
      </div>
    </div>
  );
}
