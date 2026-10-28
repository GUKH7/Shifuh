// Shared wall-clock budget for 60-second serverless iFood cron routes.
// Leave 12 seconds for database writes, response serialization and cleanup.
export const IFOOD_CRON_BUDGET_MS = 48_000;
export const IFOOD_MIN_START_MS = 8_000;

export function createIfoodCronBudget(
  budgetMs = IFOOD_CRON_BUDGET_MS,
  minStartMs = IFOOD_MIN_START_MS,
) {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 ||
      !Number.isFinite(minStartMs) || minStartMs < 0) {
    throw new Error("Invalid iFood cron time budget.");
  }
  const deadline = Date.now() + budgetMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("iFood cron budget exhausted."));
  }, budgetMs);
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, deadline - Date.now()),
    canStart: () => !controller.signal.aborted && deadline - Date.now() > minStartMs,
    dispose: () => clearTimeout(timer),
  };
}
