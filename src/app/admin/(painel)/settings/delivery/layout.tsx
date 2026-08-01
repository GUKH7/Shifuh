import type { ReactNode } from "react";
import "./delivery-layout.css";

type DeliverySettingsLayoutProps = {
  children: ReactNode;
};

export default function DeliverySettingsLayout({
  children,
}: DeliverySettingsLayoutProps) {
  return <div className="delivery-settings-route">{children}</div>;
}
