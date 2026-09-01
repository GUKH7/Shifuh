"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, LayoutGrid, Ticket } from "lucide-react";
import { AdminPageShell } from "@/components/ui/admin-primitives";

const PROMOTION_TABS = [
  {
    label: "Visão geral",
    href: "/admin/promotions",
    icon: LayoutGrid,
  },
  {
    label: "Cupons",
    href: "/admin/promotions/coupons",
    icon: Ticket,
  },
  {
    label: "Roleta da Sorte",
    href: "/admin/promotions/wheel",
    icon: Gift,
  },
];

export default function PromotionsTabs() {
  const pathname = usePathname();

  return (
    <AdminPageShell className="mb-6">
      <nav
        aria-label="Navegação de promoções"
        className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white p-1.5 shadow-sm"
      >
        {PROMOTION_TABS.map((tab) => {
          const isActive =
            tab.href === "/admin/promotions"
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${
                isActive
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-gray-500 hover:bg-[#fbf7f2] hover:text-gray-950"
              }`}
            >
              <Icon size={17} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </AdminPageShell>
  );
}
