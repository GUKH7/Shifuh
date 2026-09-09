"use client";
import StorefrontPage from "@/features/storefront/StorefrontPage";
import Account from "@/features/storefront/Account";
import Wheel from "@/features/storefront/LuckyWheelStorefrontBridge";
import Promotions from "@/features/storefront/StorefrontPromotionDiscoveryBridge";
export default function Page(){return <><StorefrontPage /><Account/><Promotions/><Wheel/></>}
