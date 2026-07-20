import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/contexts/cart-context";
import { ToastProvider } from "@/components/ui/toast-provider";

const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: true });

export const metadata: Metadata = {
  title: "Gestor Delivery",
  description: "Vitrine digital com pedidos direto no WhatsApp",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={outfit.className}>
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
