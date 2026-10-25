import { createAdminClient } from "@/lib/supabase/server";
import { acknowledgeIfoodOrderEvents, IfoodApiError } from "@/lib/ifood/orders";
import { syncIfoodOrdersForRestaurant } from "@/lib/ifood/order-sync";
import { inspectIfoodQueue, isIfoodReplayEnabled, replayStoredIfoodEvents, type IfoodReplaySummary } from "@/lib/ifood/event-replay";

type SyncSource = "manual" | "cron";

type ResilientSyncParams = {
  restaurantId: string;
  merchantId: string;
  source: SyncSource;
  maxAttempts?: number;
};

type PendingEventRow = {
  ifood_event_id: string;
  retry_count: number | null;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_EVENT_RETRIES = 6;
const BASE_DELAY_MS = 500;
const ACK_BATCH_SIZE = 100;
const MAX_ACK_BATCHES_PER_RUN = 5;
const ACK_LEASE_MS = 150_000;
const ACK_RENEW_INTERVAL_MS = 30_000;
const ACK_TRANSPORT_BUDGET_MS = 90_000;
// Use a short heartbeat only when the disposable local E2E suite opts in.
function getAckRenewIntervalMs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (process.env.IFOOD_ACK_MULTIWORKER_E2E === "1" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) return 40;
  return ACK_RENEW_INTERVAL_MS;
}
const runningSyncs = new Map<string, Promise<unknown>>();

export type IfoodSyncResult = Awaited<ReturnType<typeof syncIfoodOrdersForRestaurant>> & {
  attempts: number;
  serialized: boolean;
  pendingAcknowledgementsRecovered: number;
  retryEventsScheduled: number;
  deadLetteredEvents: number;
  replay?: IfoodReplaySummary;
  queueHealth?: { pending: number; awaitingAcknowledgement: number; deadLettered: number };
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

export function calculateNextEventRetry(retryCount: number, now = Date.now()) {
  const cappedAttempt = Math.min(Math.max(retryCount, 1), MAX_EVENT_RETRIES);
  const delayMinutes = Math.min(60, 2 ** (cappedAttempt - 1));
  return new Date(now + delayMinutes * 60_000).toISOString();
}

async function updateLatestSyncMetrics(
  restaurantId: string,
  attempts: number,
  durationMs: number,
) {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("ifood_sync_runs")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("sync_type", "orders_polling")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return;
  await admin
    .from("ifood_sync_runs")
    .update({ attempts, duration_ms: durationMs })
    .eq("id", data.id);
}

// Distributed ACK ownership is separate from order/event processing ownership.
// Never send unclaimed ACKs from another instance when replay is enabled.
// ACK delivery is at-least-once if the remote endpoint accepts a request and
// its response is lost: the provider must tolerate duplicate event IDs.
async function recoverLeasedAcknowledgements(restaurantId: string, merchantId: string) {
  const admin = createAdminClient() as any;
  let recovered = 0;

  for (let batch = 0; batch < MAX_ACK_BATCHES_PER_RUN; batch += 1) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_ifood_pending_acks", {
      p_restaurant_id: restaurantId,
      p_merchant_id: merchantId,
      p_batch_size: ACK_BATCH_SIZE,
    });
    // Fail closed: never use an unsafe direct select if the migration is absent.
    if (claimError) throw new Error("Falha ao reservar ACKs iFood no banco.");

    const rows = (claimed || []) as Array<{
      ifood_event_id: string;
      ack_lease_token: string | null;
    }>;
    if (!rows.length) break;

    const token = rows[0]?.ack_lease_token;
    const ids = rows.map((row) => row.ifood_event_id).filter(Boolean);
    if (!token || ids.length !== rows.length ||
        rows.some((row) => row.ack_lease_token !== token) ||
        new Set(ids).size !== ids.length) {
      throw new Error("Lote de ACKs iFood sem reserva válida.");
    }

    // Keep the reservation alive during slow HTTP. Renewal must own the exact
    // token and still-live lease for ALL rows in the batch. A failed check
    // aborts the provider transport and prevents stale local completion.
    const abortController = new AbortController();
    let renewal: Promise<void> | null = null;
    let ownershipLost = false;
    const heartbeat = () => {
      if (renewal || ownershipLost) return;
      renewal = (async () => {
        const { data: extended, error: extensionError } = await admin
          .from("ifood_order_events")
          .update({ ack_lease_until: new Date(Date.now() + ACK_LEASE_MS).toISOString() })
          .eq("restaurant_id", restaurantId)
          .eq("merchant_id", merchantId)
          .in("ifood_event_id", ids)
          .eq("ack_lease_token", token)
          .gt("ack_lease_until", new Date().toISOString())
          .is("acknowledged_at", null)
          .select("ifood_event_id");
        if (extensionError || !extended || extended.length !== ids.length) {
          throw new Error("Reserva de ACK iFood perdida durante envio.");
        }
      })().catch(() => {
        ownershipLost = true;
        abortController.abort();
      }).finally(() => { renewal = null; });
    };
    const timer = setInterval(heartbeat, getAckRenewIntervalMs());
    const deadline = setTimeout(() => abortController.abort(), ACK_TRANSPORT_BUDGET_MS);
    try {
      await acknowledgeIfoodOrderEvents(ids, abortController.signal);
      clearInterval(timer);
      if (renewal) await renewal;
      if (ownershipLost || abortController.signal.aborted) {
        throw new Error("ACK iFood sem reserva válida após envio.");
      }
    } finally {
      clearInterval(timer);
      clearTimeout(deadline);
      if (renewal) await renewal;
    }

    // Fence late workers: completion is valid only for the exact batch token,
    // this tenant/merchant, a still-live lease, and an unacknowledged row.
    const { data: persisted, error: updateError } = await admin
      .from("ifood_order_events")
      .update({
        acknowledged_at: new Date().toISOString(),
        last_error: null,
        ack_lease_token: null,
        ack_lease_until: null,
      })
      .eq("restaurant_id", restaurantId)
      .eq("merchant_id", merchantId)
      .in("ifood_event_id", ids)
      .eq("ack_lease_token", token)
      .gt("ack_lease_until", new Date().toISOString())
      .is("acknowledged_at", null)
      .select("ifood_event_id");

    if (updateError || !persisted || persisted.length !== ids.length) {
      // The write may already have committed despite a lost database response.
      // Do not release the lease or immediately re-send any ACK.
      throw new Error("ACK iFood possivelmente enviado; conclusão local não confirmada.");
    }
    recovered += persisted.length;
  }

  return recovered;
}

async function recoverPendingAcknowledgements(restaurantId: string, merchantId: string) {
  if (isIfoodReplayEnabled()) {
    return recoverLeasedAcknowledgements(restaurantId, merchantId);
  }

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("ifood_order_events")
    .select("ifood_event_id")
    .eq("restaurant_id", restaurantId)
    .not("processed_at", "is", null)
    .is("acknowledged_at", null)
    .order("processed_at", { ascending: true })
    .limit(500);

  if (error || !data?.length) return 0;

  let recovered = 0;
  for (let index = 0; index < data.length; index += ACK_BATCH_SIZE) {
    const ids = data
      .slice(index, index + ACK_BATCH_SIZE)
      .map((row: { ifood_event_id: string }) => row.ifood_event_id)
      .filter(Boolean);
    if (!ids.length) continue;

    await acknowledgeIfoodOrderEvents(ids);
    const acknowledgedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("ifood_order_events")
      .update({ acknowledged_at: acknowledgedAt, last_error: null })
      .eq("restaurant_id", restaurantId)
      .in("ifood_event_id", ids);

    if (updateError) throw new Error("ACK enviado, mas não foi possível registrá-lo no banco.");
    recovered += ids.length;
  }

  return recovered;
}

async function schedulePendingEventRetries(restaurantId: string, reason: string, attemptedFailedEventIds: string[]) {
  // A failed polling request did not attempt any stored event. Never increment
  // all pending events or dead-letter them due to an external API outage.
  if (!attemptedFailedEventIds.length) return { scheduled: 0, deadLettered: 0 };
  const admin = createAdminClient() as any;
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("ifood_order_events")
    .select("ifood_event_id, retry_count")
    .eq("restaurant_id", restaurantId)
    .in("ifood_event_id", attemptedFailedEventIds)
    .is("processed_at", null)
    .is("dead_lettered_at", null)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("event_created_at", { ascending: true })
    .limit(200);

  if (error || !data?.length) {
    return { scheduled: 0, deadLettered: 0 };
  }

  let scheduled = 0;
  let deadLettered = 0;

  for (const row of data as PendingEventRow[]) {
    const nextRetryCount = Number(row.retry_count || 0) + 1;
    const reachedLimit = nextRetryCount >= MAX_EVENT_RETRIES;
    const update = reachedLimit
      ? {
          retry_count: nextRetryCount,
          processing_started_at: null,
          next_retry_at: null,
          last_error: reason.slice(0, 1000),
          dead_lettered_at: nowIso,
        }
      : {
          retry_count: nextRetryCount,
          processing_started_at: null,
          next_retry_at: calculateNextEventRetry(nextRetryCount),
          last_error: reason.slice(0, 1000),
        };

    const { error: updateError } = await admin
      .from("ifood_order_events")
      .update(update)
      .eq("restaurant_id", restaurantId)
      .eq("ifood_event_id", row.ifood_event_id)
      .is("processed_at", null);

    if (updateError) continue;
    if (reachedLimit) deadLettered += 1;
    else scheduled += 1;
  }

  return { scheduled, deadLettered };
}

async function runWithRetries(params: ResilientSyncParams): Promise<IfoodSyncResult> {
  const maxAttempts = Math.max(1, params.maxAttempts || DEFAULT_MAX_ATTEMPTS);
  const startedAt = Date.now();
  let lastError: unknown;
  // Replay is optional until the additive database migration is verified.
  // Keep polling operational when the feature flag is off.
  const replay = isIfoodReplayEnabled()
    ? await replayStoredIfoodEvents(params.restaurantId, params.merchantId)
    : undefined;
  let earlyAcknowledgementsRecovered = 0;
  if (replay) {
    // ACK recovery must also work if the subsequent polling endpoint times out.
    try {
      earlyAcknowledgementsRecovered = await recoverPendingAcknowledgements(params.restaurantId, params.merchantId);
    } catch {
      console.warn("ACKs iFood permanecem na fila persistente para nova tentativa.");
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await syncIfoodOrdersForRestaurant(params);
      const pendingAcknowledgementsRecovered = await recoverPendingAcknowledgements(
        params.restaurantId,
        params.merchantId,
      );
      const retryResult = await schedulePendingEventRetries(
        params.restaurantId,
        "Falha real ao processar o evento; nova tentativa agendada.",
        result.failedEventIds,
      );
      await updateLatestSyncMetrics(params.restaurantId, attempt, Date.now() - startedAt);

      return {
        ...result,
        attempts: attempt,
        serialized: false,
        pendingAcknowledgementsRecovered: earlyAcknowledgementsRecovered + pendingAcknowledgementsRecovered,
        retryEventsScheduled: retryResult.scheduled,
        deadLetteredEvents: retryResult.deadLettered + (replay?.deadLetteredEvents ?? 0),
        ...(replay ? { replay, queueHealth: await inspectIfoodQueue(params.restaurantId) } : {}),
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização.";
      // If polling/details/ACK failed before recording an event-specific
      // failure, do not charge unrelated stored events a retry attempt.
      await updateLatestSyncMetrics(params.restaurantId, attempt, Date.now() - startedAt);

      if (!isTransientIfoodSyncError(error) || attempt >= maxAttempts ||
          (error instanceof IfoodApiError && error.retryAfterMs !== null &&
            error.retryAfterMs > 2_500)) {
        throw error;
      }
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
