import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StorefrontInitialDataProvider } from "@/features/storefront/StorefrontInitialDataProvider";
import { getPublicStorefront } from "@/features/storefront/server-data";
import styles from "./layout.module.css";

const SITE_URL = "https://www.shifuh.com.br";

export const revalidate = 60;

type StorefrontLayoutProps = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

function buildDescription(data: NonNullable<Awaited<ReturnType<typeof getPublicStorefront>>>) {
  const restaurant = data.restaurant;
  return (
    data.storefrontSubheadline?.trim() ||
    restaurant.description?.trim() ||
    `Peça online no ${restaurant.name} pelo Shifuh.`
  );
}

export async function generateMetadata({
  params,
}: Pick<StorefrontLayoutProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicStorefront(slug);

  if (!data) {
    return {
      title: "Loja não encontrada | Shifuh",
      robots: { index: false, follow: false },
    };
  }

  const restaurant = data.restaurant;
  const title = `${restaurant.name} | Shifuh`;
  const description = buildDescription(data);
  const canonicalUrl = new URL(`/${restaurant.slug}`, SITE_URL).toString();
  const socialImage =
    data.banners[0] || restaurant.image_url || restaurant.logo_url || undefined;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Shifuh",
      url: canonicalUrl,
      title,
      description,
      images: socialImage
        ? [{ url: socialImage, alt: `Cardápio de ${restaurant.name}` }]
        : undefined,
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { slug } = await params;
  const data = await getPublicStorefront(slug);

  if (!data) {
    notFound();
  }

  return (
    <div className={styles.scope}>
      <StorefrontInitialDataProvider data={data}>{children}</StorefrontInitialDataProvider>
    </div>
  );
}
