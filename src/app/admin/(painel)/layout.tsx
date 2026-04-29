"use client";

import { useEffect, useState } from "react";
import AdminSidebar from "@/components/admin-sidebar";
import { Bell, HelpCircle, Search } from "lucide-react";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const savedState = window.localStorage.getItem("admin-sidebar-collapsed");
    if (savedState !== null) {
      setIsCollapsed(savedState === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("admin-sidebar-collapsed", String(next));
      return next;
    });
  };

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
