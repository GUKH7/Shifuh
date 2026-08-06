"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, WalletCards } from "lucide-react";

const items = [
  {
    href: "/admin/settings",
    label: "Configurações gerais",
    icon: Settings,
  },
  {
    href: "/admin/settings/payments",
    label: "Formas de pagamento",
    icon: WalletCards,
  },
];

export function SettingsNavigation() {
  const pathname = usePathname();

  return (
    <div className="px-3 pt-4 sm:px-4 md:px-5 lg:px-6">
      <nav
        aria-label="Seções de configurações"
        className="admin-page-shell flex gap-2 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-2 shadow-sm"
      >
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                active
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-gray-500 hover:bg-[#faf7f3] hover:text-gray-950"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
