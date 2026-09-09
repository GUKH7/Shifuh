"use client";

import Account from "@/features/storefront/Account";
import Promotions from "@/features/storefront/StorefrontPromotionDiscoveryBridge";

export default function StorefrontBridges() {
  return (
    <>
      <Account />
      <Promotions />
    </>
  );
}
