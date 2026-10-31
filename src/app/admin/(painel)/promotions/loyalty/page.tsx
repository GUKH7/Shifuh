import LoyaltyManagementDashboard from "./LoyaltyManagementDashboard";
import LoyaltyProgramWorkspace from "./LoyaltyProgramWorkspace";
import LoyaltyRewardCatalog from "./LoyaltyRewardCatalog";
import LoyaltyWalletLedger from "./LoyaltyWalletLedger";
import ManualLoyaltyCredit from "@/features/loyalty/ManualLoyaltyCredit";

export default function PromotionsLoyaltyPage() {
  return (
    <>
      <LoyaltyManagementDashboard />
      <LoyaltyProgramWorkspace />
      <LoyaltyRewardCatalog />
      <ManualLoyaltyCredit />
      <LoyaltyWalletLedger />
    </>
  );
}
