"use client";

import StorefrontPage from "@/features/storefront/StorefrontPage";
import StorefrontAccountAccessBridge from "@/features/storefront/StorefrontAccountAccessBridge";
import Wheel from "@/features/storefront/LuckyWheelStorefrontBridge";

export default function Page() {
  return (
    <>
      <StorefrontPage />
      <StorefrontAccountAccessBridge />
      <Wheel />
    </>
  );
}
