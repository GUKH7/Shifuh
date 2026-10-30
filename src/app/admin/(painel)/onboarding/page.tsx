import OnboardingWorkspace from "@/features/onboarding/OnboardingWorkspace";

// Protected by the authenticated admin layout; data also respects RLS.
export default function OnboardingPage() {
  return <OnboardingWorkspace />;
}
