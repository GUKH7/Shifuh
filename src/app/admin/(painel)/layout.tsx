"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePathname, useRouter } from "next/navigation";
import { Bell, HelpCircle, Loader2, Search } from "lucide-react";
import AdminSidebar from "@/components/admin-sidebar";
import { getRestaurantByUserId } from "@/lib/supabase/restaurant";

const ADMIN_SEARCH_ITEMS = [
  { label: "Início", href: "/admin", keywords: ["inicio", "dashboard", "resumo", "painel"] },
  { label: "Pedidos", href: "/admin/orders", keywords: ["pedido", "pedidos", "entregas", "fila"] },
  { label: "Histórico", href: "/admin/history", keywords: ["historico", "vendas", "concluidos"] },
  { label: "Cardápios", href: "/admin/menu", keywords: ["cardapio", "menu", "produtos", "categorias"] },
  { label: "Clientes", href: "/admin/clients", keywords: ["clientes", "crm", "contatos"] },
  { label: "Cupons", href: "/admin/coupons", keywords: ["cupons", "descontos"] },
  { label: "Avaliações", href: "/admin/reviews", keywords: ["reviews", "avaliacoes", "notas"] },
  { label: "Configurações", href: "/admin/settings", keywords: ["configuracoes", "ajustes", "loja"] },
];

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isGuardLoading, setIsGuardLoading] = useState(true);
  const [panelSearch, setPanelSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    const savedState = window.localStorage.getItem("admin-sidebar-collapsed");
    if (savedState !== null) {
      setIsCollapsed(savedState === "true");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const guardAdminAccess = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/admin/login");
          return;
        }

        const { restaurant } = await getRestaurantByUserId(supabase, user.id);
        const isSetupPage = pathname === "/admin/setup";

        if (!restaurant && !isSetupPage) {
          router.replace("/admin/setup");
          return;
        }

        if (restaurant && isSetupPage) {
          router.replace("/admin");
          return;
        }
      } finally {
        if (isMounted) setIsGuardLoading(false);
      }
    };

    guardAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [pathname, router, supabase]);

  const toggleSidebar = () => {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("admin-sidebar-collapsed", String(next));
      return next;
    });
  };

  const searchResults = useMemo(() => {
    const normalizedTerm = panelSearch.trim().toLowerCase();
    if (!normalizedTerm) return [];

    return ADMIN_SEARCH_ITEMS.filter((item) => {
      const haystack = [item.label, ...item.keywords].join(" ").toLowerCase();
      return haystack.includes(normalizedTerm);
    }).slice(0, 6);
  }, [panelSearch]);

  const handleGoToSearchResult = (href: string) => {
    setPanelSearch("");
    router.push(href);
  };

  if (isGuardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf7f2]">
        <Loader2 className="animate-spin text-[var(--brand)]" size={30} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf7f2] text-gray-950">
      <AdminSidebar isCollapsed={isCollapsed} toggleSidebar={toggleSidebar} />
      <div className={`transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"}`}>
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[#fbf7f2]/95 backdrop-blur">
          <div className="flex min-h-[87px] items-center justify-between px-8 py-5">
            <div className="relative w-full max-w-xl">
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                <Search size={18} className="text-gray-400" />
                <input
                  value={panelSearch}
                  onChange={(event) => setPanelSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && searchResults[0]) {
                      event.preventDefault();
                      handleGoToSearchResult(searchResults[0].href);
                    }
                  }}
                  placeholder="Pesquisar no painel"
                  className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-500"
                />
              </div>

              {panelSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_40px_rgba(17,16,15,0.08)]">
                  {searchResults.length > 0 ? (
                    <div className="py-2">
                      {searchResults.map((item) => (
                        <button
                          key={item.href}
                          onClick={() => handleGoToSearchResult(item.href)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:bg-[#fbf7f2]"
                        >
                          <span className="font-semibold">{item.label}</span>
                          <span className="text-xs text-gray-400">Abrir</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      Nenhum resultado encontrado no painel.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ml-6 flex items-center gap-3">
              <button className="surface-card rounded-xl p-3 text-gray-500">
                <HelpCircle size={18} />
              </button>
              <button className="surface-card rounded-xl p-3 text-gray-500">
                <Bell size={18} />
              </button>
            </div>
          </div>
        </header>
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
