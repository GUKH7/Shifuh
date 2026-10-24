import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/server";
import { upsertLocalOrderFromIfood } from "@/lib/ifood/order-sync";
import { IfoodApiError, type IfoodOrderEvent } from "@/lib/ifood/orders";

const BATCH_SIZE = 10;
const MAX_PERMANENT_FAILURES = 6;
const MAX_UPSTREAM_DELAY_MS = 15 * 60_000;

type ClaimedEvent = {
  id: string;
  ifood_event_id: string;
  ifood_order_id: string;
  merchant_id: string;
  event_code: string;
  raw_payload: IfoodOrderEvent | null;
  retry_count: number;
  processing_lease_token: string;
};

export type IfoodReplaySummary = {
  claimed: number;
  processed: number;
  temporaryFailures: number;
  retryEventsScheduled: number;
  deadLetteredEvents: number;
  lostLeases: number;
  maxRetryAfterMs: number;
};

export function isIfoodReplayEnabled() {
  return process.env.IFOOD_PERSISTED_REPLAY_ENABLED === "true";
}

function eventFromRow(row: ClaimedEvent): IfoodOrderEvent {
  const raw = row.raw_payload;
  // Trusted DB columns decide which tenant/order/event is being processed.
  return {
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
    id: row.ifood_event_id,
    orderId: row.ifood_order_id,
    merchantId: row.merchant_id,
    code: row.event_code,
  };
}

function isTransient(error: unknown) {
  if (error instanceof IfoodApiError) {
    return [408, 425, 429].includes(error.status) || error.status >= 500;
  }
  return error instanceof Error && /timeout|timed out|network|fetch failed|abort/i.test(error.message);
}

function cooldownMs(error: unknown) {
  if (error && typeof error === "object" && "retryAfterMs" in error) {
    const delay = error.retryAfterMs;
    if (typeof delay === "number" && Number.isFinite(delay) && delay > 0) {
      return Math.min(MAX_UPSTREAM_DELAY_MS, delay);
    }
  }
  return 120_000;
}

function calculateNextRetry(retryCount: number) {
  const minutes = Math.min(60, 2 ** Math.max(0, Math.min(retryCount, 6) - 1));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function replayStoredIfoodEvents(
  restaurantId: string,
  merchantId: string,
): Promise<IfoodReplaySummary> {
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("claim_ifood_pending_events", {
    p_restaurant_id: restaurantId,
    p_merchant_id: merchantId,
    p_batch_size: BATCH_SIZE,
  });
  if (error) throw new Error("Não foi possível reservar eventos persistidos do iFood.");

  const events = (data || []) as ClaimedEvent[];
  const summary: IfoodReplaySummary = {
    claimed: events.length, processed: 0, temporaryFailures: 0,
    retryEventsScheduled: 0, deadLetteredEvents: 0,
    lostLeases: 0, maxRetryAfterMs: 0,
  };

  for (const row of events) {
    const ownedUpdate = (payload: Record<string, unknown>) => admin
      .from("ifood_order_events")
      .update(payload)
      .eq("id", row.id)
      .eq("restaurant_id", restaurantId)
      .eq("merchant_id", merchantId)
      .eq("processing_lease_token", row.processing_lease_token)
      .gt("processing_lease_until", new Date().toISOString())
      .is("processed_at", null)
      .select("id")
      .maybeSingle();

    try {
      const saved = await upsertLocalOrderFromIfood(admin, restaurantId, eventFromRow(row));
      const { data: marked, error: markError } = await ownedUpdate({
        local_order_id: saved.localOrderId,
        processed_at: new Date().toISOString(),
        processing_lease_token: null,
        processing_lease_until: null,
        processing_started_at: null,
        next_retry_at: null,
        last_error: null,
      });
      if (markError) throw new Error("Falha ao persistir a conclusão do evento.");
      if (!marked?.id) {
        summary.lostLeases += 1;
        continue; // Never ACK if this worker lost its lease.
      }
      summary.processed += 1;
    } catch (processingError) {
      const transient = isTransient(processingError);
      const retryCount = Number(row.retry_count || 0) + (transient ? 0 : 1);
      const deadLettered = !transient && retryCount >= MAX_PERMANENT_FAILURES;
      const delay = transient ? cooldownMs(processingError) : 0;
      const { data: updated, error: updateError } = await ownedUpdate({
        processing_lease_token: null,
        processing_lease_until: null,
        processing_started_at: null,
        retry_count: retryCount,
        next_retry_at: deadLettered ? null
          : transient ? new Date(Date.now() + delay).toISOString()
          : calculateNextRetry(retryCount),
        dead_lettered_at: deadLettered ? new Date().toISOString() : null,
        last_error: transient
          ? "Falha temporária da API iFood; evento preservado."
          : "Falha de processamento; evento mantido para revisão/retry.",
      });
      if (updateError) throw new Error("Falha ao liberar reserva do evento iFood.");
      if (!updated?.id) {
        summary.lostLeases += 1;
        continue;
      }

      if (transient) {
        summary.temporaryFailures += 1;
        summary.maxRetryAfterMs = Math.max(summary.maxRetryAfterMs, delay);
      } else if (deadLettered) {
        summary.deadLetteredEvents += 1;
        Sentry.captureMessage("ifood_event_dead_letter", {
          level: "error", tags: { integration: "ifood" },
        });
      } else {
        summary.retryEventsScheduled += 1;
      }
    }
  }

  return summary;
}

export async function inspectIfoodQueue(restaurantId: string) {
  const admin = createAdminClient() as any;
  const base = () => admin.from("ifood_order_events")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  const [pending, awaitingAck, deadLetter] = await Promise.all([
    base().is("processed_at", null).is("dead_lettered_at", null),
    base().not("processed_at", "is", null).is("acknowledged_at", null),
    base().not("dead_lettered_at", "is", null),
  ]);
  if (pending.error || awaitingAck.error || deadLetter.error) {
    throw new Error("Não foi possível consultar a fila do iFood.");
  }
  return {
    pending: pending.count || 0,
    awaitingAcknowledgement: awaitingAck.count || 0,
    deadLettered: deadLetter.count || 0,
  };
}
