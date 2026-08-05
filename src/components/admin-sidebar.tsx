"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  LayoutDashboard,
  LogOut,
  Percent,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Users,
  UtensilsCrossed,
  WalletCards,
  X,
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

const MENU_ITEMS = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Pedidos", href: "/admin/orders", icon: ShoppingBag },
  { name: "Histórico", href: "/admin/history", icon: History },
  { name: "Cardápios", href: "/admin/menu", icon: UtensilsCrossed },
  { name: "Clientes", href: "/admin/clients", icon: Users },
  { name: "Cupons", href: "/admin/coupons", icon: Percent },
  { name: "Pagamentos", href: "/admin/payments", icon: WalletCards },
  { name: "Avaliações", href: "/admin/reviews", icon: Star },
  { name: "Configurações", href: "/admin/settings", icon: Settings },
];

interface AdminSidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleSidebar: () => void;
  closeMobileSidebar: () => void;
}

export default function AdminSidebar({
  isCollapsed,
  isMobileOpen,
  toggleSidebar,
  closeMobileSidebar,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [storeSlug, setStoreSlug] = useState("");
  const [canAccessPlatform, setCanAccessPlatform] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    const loadRestaurant = async () => {
      const { restaurant } = await getCurrentRestaurant(supabase);
      if (restaurant?.slug) setStoreSlug(restaurant.slug);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCanAccessPlatform(isPlatformAdminEmail(user?.email));
    };

    loadRestaurant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const desktopItemLayout = isCollapsed ? "lg:justify-center lg:px-3" : "lg:gap-3 lg:px-4";
  const desktopLabelVisibility = isCollapsed ? "lg:hidden" : "";

  return (
    <aside
      aria-label="Navegação administrativa"
      className={`fixed left-0 top-0 z-50 flex h-dvh w-[min(18rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-[var(--line)] bg-white shadow-2xl transition-[transform,width] duration-300 lg:h-screen lg:translate-x-0 lg:overflow-visible lg:shadow-none ${
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${isCollapsed ? "lg:w-16" : "lg:w-56"}`}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        className="absolute -right-4 top-[70px] z-50 hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white text-gray-500 shadow-sm transition-colors hover:bg-[var(--brand-soft)] hover:text-gray-950 lg:flex"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="flex h-16 shrink-0 items-center justify-between px-4 sm:h-20 lg:px-5">
        <div className={`flex items-center gap-3 ${isCollapsed ? "lg:justify-center" : ""}`}>
          <div className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
            <Store size={17} />
          </div>
          <div className={desktopLabelVisibility}>
            <p className="text-base font-black tracking-tight text-gray-950">GESTOR.</p>
            <p className="text-[11px] text-gray-500">Portal da loja</p>
          </div>
        </div>

        <button
          type="button"
          onClick={closeMobileSidebar}
          aria-label="Fechar menu lateral"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-3 py-3 sm:py-4 lg:px-3">
        <nav className="space-y-1">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileSidebar}
                title={isCollapsed ? item.name : undefined}
                className={`group flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${desktopItemLayout} ${
                  isActive
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-gray-600 hover:bg-[#faf5ef] hover:text-gray-950"
                }`}
              >
                <item.icon
                  size={19}
                  className={`shrink-0 transition-colors ${
                    isActive ? "text-[var(--brand)]" : "text-gray-400 group-hover:text-gray-950"
                  }`}
                />
                <span className={desktopLabelVisibility}>{item.name}</span>
              </Link>
            );
          })}

          {canAccessPlatform && (
            <Link
              href="/admin/platform"
              onClick={closeMobileSidebar}
              title={isCollapsed ? "Lojas cadastradas" : undefined}
              className={`group flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${desktopItemLayout} ${
                pathname === "/admin/platform"
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-gray-600 hover:bg-[#faf5ef] hover:text-gray-950"
              }`}
            >
              <Store
                size={19}
                className={`shrink-0 transition-colors ${
                  pathname === "/admin/platform"
                    ? "text-[var(--brand)]"
                    : "text-gray-400 group-hover:text-gray-950"
                }`}
              />
              <span className={desktopLabelVisibility}>Lojas cadastradas</span>
            </Link>
          )}
        </nav>
      </div>

      <div className="mt-auto border-t border-[var(--line)] p-3">
        {storeSlug ? (
          <Link
            href={`/${storeSlug}`}
            target="_blank"
            onClick={closeMobileSidebar}
            title={isCollapsed ? "Ver vitrine" : undefined}
            className={`group mb-2 flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-[#171311] hover:bg-[#171311] hover:text-white focus-visible:border-[#171311] focus-visible:bg-[#171311] focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200 ${desktopItemLayout}`}
          >
            <ExternalLink size={18} className="shrink-0" />
            <span className={desktopLabelVisibility}>Ver vitrine</span>
          </Link>
        ) : (
          <button
            disabled
            title={isCollapsed ? "Vitrine indisponível" : undefined}
            className={`mb-2 flex w-full cursor-not-allowed items-center gap-3 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-400 ${desktopItemLayout}`}
          >
            <ExternalLink size={18} className="shrink-0" />
            <span className={desktopLabelVisibility}>Ver vitrine</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? "Sair" : undefined}
          className={`group flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:border-red-600 focus-visible:bg-red-600 focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100 ${desktopItemLayout}`}
        >
          <LogOut size={19} className="shrink-0" />
          <span className={desktopLabelVisibility}>Sair</span>
        </button>
      </div>
    </aside>
  );
}
