import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncIfoodOrdersWithResilience } from "@/lib/ifood/order-sync-resilience";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 2;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient() as any;
  const { data: integrations, error } = await admin
    .from("ifood_integrations")
    .select("restaurant_id, merchant_id, order_sync_enabled")
    .eq("order_sync_enabled", true)
    .not("merchant_id", "is", null);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Não foi possível listar as integrações iFood." },
      { status: 500 },
    );
  }

  const queue = (integrations || []).filter(
    (integration: { restaurant_id?: string; merchant_id?: string }) =>
      Boolean(integration.restaurant_id && integration.merchant_id),
  );
  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < queue.length; index += CONCURRENCY) {
    const batch = queue.slice(index, index + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (integration: { restaurant_id: string; merchant_id: string }) => {
        const integrationStartedAt = Date.now();
        try {
          const summary = await syncIfoodOrdersWithResilience({
            restaurantId: integration.restaurant_id,
            merchantId: integration.merchant_id,
            source: "cron",
          });
          return {
            restaurantId: integration.restaurant_id,
            ok: true,
            durationMs: Date.now() - integrationStartedAt,
            summary,
          };
        } catch (syncError) {
          console.error(
            `Falha isolada no cron resiliente da loja ${integration.restaurant_id}:`,
            syncError,
          );
          return {
            restaurantId: integration.restaurant_id,
            ok: false,
            durationMs: Date.now() - integrationStartedAt,
            error:
              syncError instanceof Error
                ? syncError.message
                : "Falha ao sincronizar a fila de pedidos.",
          };
        }
      }),
    );
    results.push(...batchResults);
  }

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;
  const status = failed === 0 ? "success" : succeeded > 0 ? "partial_success" : "error";

  return NextResponse.json({
    ok: failed === 0,
    status,
    integrationsChecked: queue.length,
    integrationsSucceeded: succeeded,
    integrationsFailed: failed,
    durationMs: Date.now() - startedAt,
    results,
  });
}
