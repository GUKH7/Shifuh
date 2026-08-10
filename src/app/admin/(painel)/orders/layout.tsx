import type { ReactNode } from "react";
import { OrdersWhatsappStatus } from "./OrdersWhatsappStatus";
import "./orders-header-responsive.css";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <OrdersWhatsappStatus />
    </>
  );
}
