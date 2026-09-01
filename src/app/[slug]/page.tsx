"use client";

import StorefrontPage from "@/features/storefront/StorefrontPage";
import LuckyWheelStorefrontBridge from "@/features/storefront/LuckyWheelStorefrontBridge";

export default function StorefrontRoutePage() {
  return (
    <>
      <StorefrontPage />
      <LuckyWheelStorefrontBridge />
    </>
  );
}
