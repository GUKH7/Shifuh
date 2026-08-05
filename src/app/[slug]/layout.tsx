import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StorefrontInitialDataProvider } from "@/features/storefront/StorefrontInitialDataProvider";
import { StorefrontUnavailableState } from "@/features/storefront/StorefrontUnavailableState";
import {
  getPublicStorefrontData,
  isPublicStorefrontConfigured,
} from "@/lib/storefront/public-data";
import styles from "./layout.module.css";

export const revalidate = 60;

type StorefrontLayoutProps = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

function getPublicOrigin() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "https://gestor-delivery-tau.vercel.app";

  return configuredOrigin.startsWith("http")
    ? configuredOrigin
    : `https://${configuredOrigin}`;
}

export async function generateMetadata({
  params,
}: Pick<StorefrontLayoutProps, "params">): Promise<Metadata> {
  const origin = getPublicOrigin();

  if (!isPublicStorefrontConfigured()) {
    return {
      metadataBase: new URL(origin),
      title: "Vitrine indisponível | Gestor Delivery",
      description: "Ambiente sem configuração pública da vitrine.",
      robots: { index: false, follow: false },
    };
  }

  const { slug } = await params;
  const data = await getPublicStorefrontData(slug);

  if (!data) {
    return {
      metadataBase: new URL(origin),
      title: "Restaurante não encontrado | Gestor Delivery",
      robots: { index: false, follow: false },
    };
  }

  const { restaurant } = data;
  const title = `${restaurant.name} | Cardápio e delivery`;
  const description =
    restaurant.storefront_subheadline ||
    restaurant.storefront_headline ||
    `Confira o cardápio de ${restaurant.name} e faça seu pedido online.`;
  const canonicalUrl = new URL(`/${restaurant.slug}`, origin);
  const banners = Array.isArray(restaurant.banners) ? restaurant.banners : [];
  const socialImage =
    banners.find((banner): banner is string => typeof banner === "string" && banner.length > 0) ||
    restaurant.image_url ||
    restaurant.logo_url ||
    undefined;
  const images = socialImage ? [socialImage] : undefined;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Gestor Delivery",
      title,
      description,
      url: canonicalUrl,
      images,
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
    icons: restaurant.logo_url ? { icon: restaurant.logo_url } : undefined,
    robots: { index: true, follow: true },
  };
}

export default async function StorefrontLayout({
  children,
  params,
}: StorefrontLayoutProps) {
  if (!isPublicStorefrontConfigured()) {
    return (
      <div className={styles.scope}>
        <StorefrontUnavailableState />
      </div>
    );
  }

  const { slug } = await params;
  const data = await getPublicStorefrontData(slug);

  if (!data) notFound();

  return (
    <div className={styles.scope}>
      <StorefrontInitialDataProvider data={data}>
        {children}
      </StorefrontInitialDataProvider>
    </div>
  );
}
