"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin-sidebar";
import { Bell, HelpCircle, Loader2, Search } from "lucide-react";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isGuardLoading, setIsGuardLoading] = useState(true);
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

        const { data: restaurant } = await supabase
          .from("restaurants")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

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
          <div className="flex items-center justify-between px-8 py-5">
            <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              <Search size={18} className="text-gray-400" />
              <input
                readOnly
                value="Pesquisar no painel"
                className="w-full bg-transparent text-sm text-gray-500 outline-none"
              />
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
