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
} from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

const MENU_ITEMS = [
  { name: "Início", href: "/admin", icon: LayoutDashboard },
  { name: "Pedidos", href: "/admin/orders", icon: ShoppingBag },
  { name: "Histórico", href: "/admin/history", icon: History },
  { name: "Cardápios", href: "/admin/menu", icon: UtensilsCrossed },
  { name: "Clientes", href: "/admin/clients", icon: Users },
  { name: "Cupons", href: "/admin/coupons", icon: Percent },
  { name: "Avaliações", href: "/admin/reviews", icon: Star },
  { name: "Configurações", href: "/admin/settings", icon: Settings },
];

interface AdminSidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export default function AdminSidebar({ isCollapsed, toggleSidebar }: AdminSidebarProps) {
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

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-screen flex-col overflow-visible border-r border-[var(--line)] bg-white transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-56"
      }`}
    >
      <button
        onClick={toggleSidebar}
        className="absolute -right-4 top-[70px] z-50 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white text-gray-500 shadow-sm transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div
        className={`flex h-20 items-center px-5 ${
          isCollapsed ? "justify-center px-2" : ""
        }`}
      >
        <div className={`flex items-center gap-3 ${isCollapsed ? "justify-center" : ""}`}>
          <div className="brand-gradient flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
            <Store size={17} />
          </div>
          {!isCollapsed && (
            <div>
              <p className="text-base font-black tracking-tight text-gray-950">GESTOR.</p>
              <p className="text-[11px] text-gray-500">Portal da loja</p>
            </div>
          )}
        </div>
      </div>

      <div className={`px-3 py-4 ${isCollapsed ? "px-2" : ""}`}>
        <nav className="space-y-1">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center rounded-2xl text-sm font-semibold transition-all ${
                  isCollapsed ? "justify-center px-3 py-2.5" : "gap-3 px-4 py-2.5"
                } ${
                  isActive
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-gray-600 hover:bg-[#faf5ef] hover:text-gray-950"
                }`}
              >
                <item.icon
                  size={19}
                  className={isActive ? "text-[var(--brand)]" : "text-gray-400"}
                />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}

          {canAccessPlatform && (
            <Link
              href="/admin/platform"
              title={isCollapsed ? "Lojas cadastradas" : undefined}
              className={`flex items-center rounded-2xl text-sm font-semibold transition-all ${
                isCollapsed ? "justify-center px-3 py-2.5" : "gap-3 px-4 py-2.5"
              } ${
                pathname === "/admin/platform"
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-gray-600 hover:bg-[#faf5ef] hover:text-gray-950"
              }`}
            >
              <Store
                size={19}
                className={pathname === "/admin/platform" ? "text-[var(--brand)]" : "text-gray-400"}
              />
              {!isCollapsed && <span>Lojas cadastradas</span>}
            </Link>
          )}
        </nav>
      </div>

      <div className="mt-auto border-t border-[var(--line)] p-3">
        {storeSlug ? (
          <Link
            href={`/${storeSlug}`}
            target="_blank"
            title={isCollapsed ? "Ver vitrine" : undefined}
            className={`mb-2 flex w-full items-center rounded-2xl bg-[#171311] text-sm font-bold text-white transition-all hover:bg-black ${
              isCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"
            }`}
          >
            <ExternalLink size={18} />
            {!isCollapsed && <span>Ver vitrine</span>}
          </Link>
        ) : (
          <button
            disabled
            title={isCollapsed ? "Vitrine indisponível" : undefined}
            className={`mb-2 flex w-full cursor-not-allowed items-center rounded-2xl bg-gray-100 text-sm font-bold text-gray-400 ${
              isCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"
            }`}
          >
            <ExternalLink size={18} />
            {!isCollapsed && <span>Ver vitrine</span>}
          </button>
        )}

        <button
          onClick={handleLogout}
          title={isCollapsed ? "Sair" : undefined}
          className={`group flex w-full items-center rounded-2xl text-sm font-semibold text-gray-500 transition-all hover:bg-[#faf5ef] hover:text-red-600 ${
            isCollapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3"
          }`}
        >
          <LogOut size={19} className="text-gray-400 transition-colors group-hover:text-red-600" />
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
