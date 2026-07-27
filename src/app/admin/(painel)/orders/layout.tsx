import type { ReactNode } from "react";
import OrdersWorkspace from "./OrdersWorkspace";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  void children;
  return <OrdersWorkspace />;
}
