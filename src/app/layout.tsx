import type { Metadata, Viewport } from "next";
import { Fredoka, Outfit } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/contexts/cart-context";
import { ToastProvider } from "@/components/ui/toast-provider";

const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: true });
const fredoka = Fredoka({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-fredoka",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Shifuh",
  description: "Vitrine digital com pedidos direto no WhatsApp",
  icons: {
    icon: "/brand/shifuh-icon.svg",
    shortcut: "/brand/shifuh-icon.svg",
    apple: "/brand/shifuh-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.className} ${fredoka.variable}`}>
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
