import type { OnboardingReadiness, ReadinessStep } from "./readiness";

/** Deterministic next action, derived only from persisted readiness. */
export function getNextSetupStep(readiness: OnboardingReadiness): ReadinessStep | null {
  return readiness.steps.find(step => step.status === "incomplete") ?? null;
}

/** A return to the browser tab should refresh the checklist, not mark a step by clicking. */
export function shouldRefreshSetupOnFocus(visibility: string): boolean {
  return visibility === "visible";
}
