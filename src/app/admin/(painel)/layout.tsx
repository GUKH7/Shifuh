"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePathname, useRouter } from "next/navigation";
import { Bell, HelpCircle, Loader2, Menu, Search } from "lucide-react";
import AdminSidebar from "@/components/admin-sidebar";
import { getRestaurantByUserId } from "@/lib/supabase/restaurant";
import "./admin-responsive.css";

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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

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
    <div className="min-h-screen overflow-x-hidden bg-[#fbf7f2] text-gray-950">
      <AdminSidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        toggleSidebar={toggleSidebar}
        closeMobileSidebar={() => setIsMobileSidebarOpen(false)}
      />

      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu lateral"
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <div
        className={`w-full min-w-0 transition-all duration-300 lg:max-w-[calc(100vw_-_var(--admin-sidebar-width))] ${
          isCollapsed ? "lg:ml-16" : "lg:ml-56"
        }`}
        style={{ "--admin-sidebar-width": isCollapsed ? "4rem" : "14rem" } as React.CSSProperties}
      >
        <header className="sticky top-0 z-30 bg-[#fbf7f2]/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-2 px-3 py-2 sm:h-20 sm:gap-3 sm:px-4 sm:py-0 lg:px-6">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Abrir menu lateral"
              className="surface-card inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-600 lg:hidden"
            >
              <Menu size={19} />
            </button>

            <div className="relative min-w-0 flex-1 sm:max-w-lg">
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 sm:px-4">
                <Search size={17} className="shrink-0 text-gray-400" />
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
                  className="min-w-0 w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-500"
                />
              </div>

              {panelSearch.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_40px_rgba(17,16,15,0.08)]">
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

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                aria-label="Ajuda"
                className="surface-card hidden rounded-xl p-2.5 text-gray-500 sm:inline-flex"
              >
                <HelpCircle size={17} />
              </button>
              <button
                type="button"
                aria-label="Notificações"
                className="surface-card inline-flex rounded-xl p-2.5 text-gray-500"
              >
                <Bell size={17} />
              </button>
            </div>
          </div>
        </header>

        <main className="admin-panel-content min-w-0 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 md:px-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
