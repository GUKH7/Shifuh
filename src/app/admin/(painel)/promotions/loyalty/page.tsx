import LoyaltyManagementDashboard from "./LoyaltyManagementDashboard";
import LoyaltyProgramWorkspace from "./LoyaltyProgramWorkspace";
import LoyaltyRewardCatalog from "./LoyaltyRewardCatalog";
import LoyaltyWalletLedger from "./LoyaltyWalletLedger";

export default function PromotionsLoyaltyPage() {
  return (
    <>
      <LoyaltyManagementDashboard />
      <LoyaltyProgramWorkspace />
      <LoyaltyRewardCatalog />
      <LoyaltyWalletLedger />
    </>
  );
}
