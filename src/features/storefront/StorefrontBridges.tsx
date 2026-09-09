"use client";

import Account from "@/features/storefront/Account";
import Wheel from "@/features/storefront/LuckyWheelStorefrontBridge";
import Promotions from "@/features/storefront/StorefrontPromotionDiscoveryBridge";

export default function StorefrontBridges() {
  return (
    <>
      <Account />
      <Promotions />
      <Wheel />
    </>
  );
}
