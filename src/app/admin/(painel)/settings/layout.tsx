import type { ReactNode } from "react";
import { SettingsPageSkeleton } from "@/components/ui/admin-page-skeletons";
import { SettingsWhatsappDeepLink } from "./SettingsWhatsappDeepLink";
import "./settings-standardization.css";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="settings-route-shell">
      <div className="settings-route-skeleton" aria-hidden="true">
        <SettingsPageSkeleton />
      </div>
      <div className="settings-route-content">{children}</div>
      <SettingsWhatsappDeepLink />
    </div>
  );
}
