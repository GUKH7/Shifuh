import type { Metadata } from "next";
import { OrderTrackingClient } from "./tracking-client";

export const metadata: Metadata = {
  title: "Acompanhar pedido | Shifuh",
  description: "Acompanhe o preparo e a entrega do seu pedido.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function OrderTrackingPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token || "";

  return <OrderTrackingClient orderId={id} token={token} />;
}
