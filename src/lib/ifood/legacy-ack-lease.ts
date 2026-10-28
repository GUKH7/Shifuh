import { randomUUID } from "node:crypto";

// Reuse processing leases only for *processed* legacy events, which are excluded
// from the optional event-replay claim RPC. No pending ACK migration required.
// These leases fence concurrent sends, not exactly-once delivery after crashes.
const LEGACY_ACK_LEASE_MS = 150_000;
const LEGACY_ACK_HTTP_BUDGET_MS = 45_000;
const LEGACY_ACK_BATCH_SIZE = 100;

type SendAcks = (ids: string[], signal?: AbortSignal) => Promise<unknown>;

export async function deliverLegacyIfoodAcks(
  admin: any,
  restaurantId: string,
  merchantId: string,
  eventIds: string[],
  sendAcks: SendAcks,
  signal?: AbortSignal,
): Promise<number> {
  const distinct = [...new Set(eventIds.filter(Boolean))];
  let confirmed = 0;

  for (let i = 0; i < distinct.length; i += LEGACY_ACK_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = distinct.slice(i, i + LEGACY_ACK_BATCH_SIZE);
    const token = randomUUID();
    const now = new Date();
    const claim = admin.from("ifood_order_events")
      .update({
        processing_lease_token: token,
        processing_lease_until: new Date(now.getTime() + LEGACY_ACK_LEASE_MS).toISOString(),
      })
      .eq("restaurant_id", restaurantId)
      .eq("merchant_id", merchantId)
      .in("ifood_event_id", batch)
      .not("processed_at", "is", null)
      .is("acknowledged_at", null)
      .or(`processing_lease_until.is.null,processing_lease_until.lte.${now.toISOString()}`)
      .select("ifood_event_id,processing_lease_token");
    if (signal) claim.abortSignal(signal);
    const { data: leased, error: claimError } = await claim;
    if (claimError) throw new Error("Não foi possível reservar os ACKs legados do iFood.");
    const rows = (leased || []) as Array<{ ifood_event_id: string; processing_lease_token: string }>;
    const claimedIds = rows.map(row => row.ifood_event_id);
    if (claimedIds.length > batch.length ||
        rows.some(row => row.processing_lease_token !== token || !batch.includes(row.ifood_event_id)) ||
        new Set(claimedIds).size !== claimedIds.length) {
      throw new Error("Reserva legada de ACK inconsistente; envio bloqueado.");
    }
    if (!claimedIds.length) continue;

    // A lost provider response or SQL response is ambiguous: never release
    // ownership or immediately resend. Retry only after the lease expires.
    const transportSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(LEGACY_ACK_HTTP_BUDGET_MS)])
      : AbortSignal.timeout(LEGACY_ACK_HTTP_BUDGET_MS);
    await sendAcks(claimedIds, transportSignal);
    transportSignal.throwIfAborted();

    const completion = admin.from("ifood_order_events")
      .update({
        acknowledged_at: new Date().toISOString(),
        processing_lease_token: null,
        processing_lease_until: null,
      })
      .eq("restaurant_id", restaurantId)
      .eq("merchant_id", merchantId)
      .in("ifood_event_id", claimedIds)
      .eq("processing_lease_token", token)
      .gt("processing_lease_until", new Date().toISOString())
      .is("acknowledged_at", null)
      .select("ifood_event_id");
    if (signal) completion.abortSignal(signal);
    const { data: persisted, error: persistError } = await completion;
    transportSignal.throwIfAborted();
    const persistedIds = (persisted || []).map((r: {ifood_event_id: string}) => r.ifood_event_id);
    if (persistError || persistedIds.length !== claimedIds.length ||
        new Set(persistedIds).size !== claimedIds.length ||
        claimedIds.some(id => !persistedIds.includes(id))) {
      throw new Error("ACK iFood possivelmente aceito; confirmação local ambígua sob lease.");
    }
    confirmed += persistedIds.length;
  }
  return confirmed;
}
