import type { Metadata, Viewport } from "next";
import { Fredoka, Outfit } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/contexts/cart-context";
import { ToastProvider } from "@/components/ui/toast-provider";
import { SHIFUH_BRAND } from "@/lib/brand";

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
  metadataBase: new URL(SHIFUH_BRAND.siteUrl),
  applicationName: SHIFUH_BRAND.name,
  title: {
    default: SHIFUH_BRAND.name,
    template: `%s | ${SHIFUH_BRAND.name}`,
  },
  description: SHIFUH_BRAND.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SHIFUH_BRAND.name,
    url: "/",
    title: SHIFUH_BRAND.name,
    description: SHIFUH_BRAND.description,
  },
  twitter: {
    card: "summary",
    title: SHIFUH_BRAND.name,
    description: SHIFUH_BRAND.description,
  },
  icons: {
    icon: SHIFUH_BRAND.iconPath,
    shortcut: SHIFUH_BRAND.iconPath,
    apple: SHIFUH_BRAND.iconPath,
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
