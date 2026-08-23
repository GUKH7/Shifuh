"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import AdminSidebar from "@/components/admin-sidebar";
import { AdminHeaderActions } from "@/components/admin-header-actions";
import { AdminSkeleton } from "@/components/ui/admin-primitives";
import "./admin-responsive.css";
import "./admin-logo-radius.css";

const ADMIN_SEARCH_ITEMS = [
  { label: "Dashboard", href: "/admin", keywords: ["inicio", "dashboard", "resumo", "painel"] },
  { label: "Pedidos", href: "/admin/orders", keywords: ["pedido", "pedidos", "entregas", "fila"] },
  { label: "Histórico", href: "/admin/history", keywords: ["historico", "vendas", "concluidos"] },
  { label: "Cardápios", href: "/admin/menu", keywords: ["cardapio", "menu", "produtos", "categorias"] },
  { label: "Clientes", href: "/admin/clients", keywords: ["clientes", "crm", "contatos"] },
  { label: "Cupons", href: "/admin/coupons", keywords: ["cupons", "descontos"] },
  { label: "Pagamentos", href: "/admin/payments", keywords: ["pagamentos", "pix", "cartao", "dinheiro"] },
  { label: "Avaliações", href: "/admin/reviews", keywords: ["reviews", "avaliacoes", "notas"] },
  { label: "Configurações", href: "/admin/settings", keywords: ["configuracoes", "ajustes", "loja"] },
  { label: "Admin da plataforma", href: "/admin/platform", keywords: ["plataforma", "lojas", "rbac", "auditoria"] },
];

type AdminNavigationContext = {
  restaurant: { id: string; slug: string } | null;
  platformAccess: { role: string } | null;
};

function AdminGuardSkeleton() {
  return (
    <div className="min-h-screen bg-[#fbf7f2]">
      <div className="hidden h-screen w-16 border-r border-[var(--line)] bg-white lg:fixed lg:block" />
      <div className="lg:ml-16">
        <div className="h-16 border-b border-[var(--line)] bg-[#fbf7f2] px-3 py-2 sm:h-20 sm:px-4 lg:px-6">
          <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <AdminSkeleton className="h-10 w-10 lg:hidden" />
            <AdminSkeleton className="col-start-2 h-11 w-full max-w-2xl justify-self-start" />
            <div className="col-start-3 flex gap-2">
              <AdminSkeleton className="h-10 w-10" />
              <AdminSkeleton className="h-10 w-10" />
            </div>
          </div>
        </div>
        <div className="px-3 py-4 sm:px-4 md:px-5 lg:px-6">
          <div className="admin-page-shell space-y-4">
            <AdminSkeleton className="h-20 w-full" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <AdminSkeleton key={index} className="h-36 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isGuardLoading, setIsGuardLoading] = useState(true);
  const [storeSlug, setStoreSlug] = useState("");
  const [canAccessPlatform, setCanAccessPlatform] = useState(false);
  const [panelSearch, setPanelSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const savedState = window.localStorage.getItem("admin-sidebar-collapsed");
    if (savedState !== null) setIsCollapsed(savedState === "true");
  }, []);

  useEffect(() => setIsMobileSidebarOpen(false), [pathname]);

  useEffect(() => {
    if (pathname !== "/admin/orders") return;
    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frameId);
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
      setIsGuardLoading(true);
      try {
        const response = await fetch("/api/admin/context", { cache: "no-store" });

        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }

        if (!response.ok) {
          throw new Error(`Falha ao carregar contexto administrativo (${response.status})`);
        }

        const context = (await response.json()) as AdminNavigationContext;
        if (!isMounted) return;

        const restaurant = context.restaurant ?? null;
        const hasPlatformAccess = Boolean(context.platformAccess);
        setStoreSlug(restaurant?.slug ?? "");
        setCanAccessPlatform(hasPlatformAccess);

        const isPlatformPage = pathname.startsWith("/admin/platform");
        if (isPlatformPage) {
          if (!hasPlatformAccess) router.replace("/admin");
          return;
        }

        const isSetupPage = pathname === "/admin/setup";
        if (!restaurant && !isSetupPage) {
          router.replace("/admin/setup");
          return;
        }

        if (restaurant && isSetupPage) {
          router.replace("/admin");
        }
      } catch (error) {
        console.error("Falha no guard administrativo:", error);
      } finally {
        if (isMounted) setIsGuardLoading(false);
      }
    };

    void guardAdminAccess();
    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

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
    return ADMIN_SEARCH_ITEMS.filter((item) =>
      [item.label, ...item.keywords].join(" ").toLowerCase().includes(normalizedTerm),
    ).slice(0, 6);
  }, [panelSearch]);

  const handleGoToSearchResult = (href: string) => {
    setPanelSearch("");
    router.push(href);
  };

  if (isGuardLoading) return <AdminGuardSkeleton />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbf7f2] text-gray-950">
      <AdminSidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        toggleSidebar={toggleSidebar}
        closeMobileSidebar={() => setIsMobileSidebarOpen(false)}
        storeSlug={storeSlug}
        canAccessPlatform={canAccessPlatform}
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
        <header className="admin-panel-header sticky top-0 z-30 bg-[#fbf7f2]/95 backdrop-blur">
          <div className="h-16 px-3 py-2 sm:h-20 sm:px-4 sm:py-0 lg:px-6">
            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                aria-label="Abrir menu lateral"
                className="surface-card inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-600 lg:hidden"
              >
                <Menu size={19} />
              </button>

              <div className="relative col-start-2 w-full min-w-0 max-w-2xl justify-self-start">
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

              <AdminHeaderActions />
            </div>
          </div>
        </header>

        <main className="admin-panel-content min-w-0 overflow-x-hidden px-3 py-3 sm:px-4 sm:py-5 md:px-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
