import { IfoodApiError } from "@/lib/ifood/orders";
import { syncIfoodOrdersForRestaurant } from "@/lib/ifood/order-sync";

type SyncSource = "manual" | "cron";

type ResilientSyncParams = {
  restaurantId: string;
  merchantId: string;
  source: SyncSource;
  maxAttempts?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const runningSyncs = new Map<string, Promise<unknown>>();

export type IfoodSyncResult = Awaited<ReturnType<typeof syncIfoodOrdersForRestaurant>> & {
  attempts: number;
  serialized: boolean;
};

export function isTransientIfoodSyncError(error: unknown) {
  if (error instanceof IfoodApiError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("temporariamente")
    );
  }

  return false;
}

function waitForRetry(attempt: number) {
  const jitter = Math.floor(Math.random() * 200);
  const delay = BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1) + jitter;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function runWithRetries(params: ResilientSyncParams): Promise<IfoodSyncResult> {
  const maxAttempts = Math.max(1, params.maxAttempts || DEFAULT_MAX_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await syncIfoodOrdersForRestaurant(params);
      return { ...result, attempts: attempt, serialized: false };
    } catch (error) {
      lastError = error;
      if (!isTransientIfoodSyncError(error) || attempt >= maxAttempts) throw error;
      await waitForRetry(attempt);
    }
  }

  throw lastError;
}

export async function syncIfoodOrdersWithResilience(
  params: ResilientSyncParams,
): Promise<IfoodSyncResult> {
  const existing = runningSyncs.get(params.restaurantId);
  if (existing) {
    const result = (await existing) as IfoodSyncResult;
    return { ...result, serialized: true };
  }

  const task = runWithRetries(params).finally(() => {
    runningSyncs.delete(params.restaurantId);
  });
  runningSyncs.set(params.restaurantId, task);

  return task;
}

const STATUS_RANK: Record<string, number> = {
  pending: 10,
  preparing: 20,
  delivering: 30,
  done: 40,
  canceled: 100,
};

export function shouldApplyIfoodStatus(
  currentStatus: string | null | undefined,
  nextStatus: string | null | undefined,
) {
  if (!nextStatus) return false;
  if (!currentStatus) return true;
  if (currentStatus === "canceled" || currentStatus === "done") {
    return nextStatus === currentStatus;
  }
  if (nextStatus === "canceled") return true;
  return (STATUS_RANK[nextStatus] || 0) >= (STATUS_RANK[currentStatus] || 0);
}

export function sortAndDeduplicateIfoodEvents<T extends {
  id: string;
  orderId: string;
  createdAt?: string;
}>(events: T[]) {
  const uniqueById = new Map<string, T>();

  for (const event of events) {
    if (!event?.id || !event?.orderId) continue;
    const existing = uniqueById.get(event.id);
    if (!existing) {
      uniqueById.set(event.id, event);
      continue;
    }

    const existingTime = Date.parse(existing.createdAt || "") || 0;
    const nextTime = Date.parse(event.createdAt || "") || 0;
    if (nextTime >= existingTime) uniqueById.set(event.id, event);
  }

  return Array.from(uniqueById.values()).sort((a, b) => {
    const timeA = Date.parse(a.createdAt || "") || 0;
    const timeB = Date.parse(b.createdAt || "") || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
}
