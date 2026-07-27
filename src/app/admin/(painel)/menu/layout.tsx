import type { ReactNode } from "react";
import { MenuPageSkeleton } from "@/components/ui/admin-page-skeletons";
import "./menu-standardization.css";

export default function MenuLayout({ children }: { children: ReactNode }) {
  return (
    <div className="menu-route-shell">
      <div className="menu-route-skeleton" aria-hidden="true">
        <MenuPageSkeleton />
      </div>
      <div className="menu-route-content">{children}</div>
    </div>
  );
}
