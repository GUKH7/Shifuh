import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncIfoodOrdersWithResilience } from "@/lib/ifood/order-sync-resilience";
import { IfoodApiError } from "@/lib/ifood/orders";
import { createIfoodCronBudget } from "@/lib/ifood/cron-budget";
import { withIfoodSqlSignal } from "@/lib/ifood/sql-abort";
import {
  summarizeIfoodCronResults,
  type IfoodCronResult,
} from "@/lib/ifood/cron-result";

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
  const budget = createIfoodCronBudget();
  try {
  const admin = createAdminClient() as any;
  const { data: integrations, error } = await withIfoodSqlSignal(admin
    .from("ifood_integrations")
    .select("restaurant_id, merchant_id, order_sync_enabled")
    .eq("order_sync_enabled", true)
    .not("merchant_id", "is", null), budget.signal);

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
  const results: Array<IfoodCronResult & Record<string, unknown>> = [];

  for (let index = 0; index < queue.length; index += CONCURRENCY) {
    const batch = queue.slice(index, index + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (integration: { restaurant_id: string; merchant_id: string }) => {
        const integrationStartedAt = Date.now();
        if (!budget.canStart()) {
          return { restaurantId: integration.restaurant_id, ok: false,
            durationMs: 0, error: "Orçamento do cron insuficiente; integração adiada." };
        }
        try {
          const summary = await syncIfoodOrdersWithResilience({
            restaurantId: integration.restaurant_id,
            merchantId: integration.merchant_id,
            source: "cron",
            signal: budget.signal,
          });
          if (summary.queueHealth?.deadLettered ||
              (summary.queueHealth?.pending ?? 0) > 10) {
            console.warn(JSON.stringify({
              event: "ifood_reconciliation_backlog",
              restaurantId: integration.restaurant_id,
              ...summary.queueHealth,
            }));
          }
          return {
            restaurantId: integration.restaurant_id,
            ok: summary.pendingEvents === 0 && (summary.queueHealth?.deadLettered ?? 0) === 0,
            durationMs: Date.now() - integrationStartedAt,
            retryAfterSeconds: Math.max(
              summary.upstreamRetryAfterMs > 0 ? Math.ceil(summary.upstreamRetryAfterMs / 1_000) : 0,
              summary.replay?.maxRetryAfterMs ? Math.ceil(summary.replay.maxRetryAfterMs / 1_000) : 0,
            ) || null,
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
            retryAfterSeconds:
              syncError instanceof IfoodApiError && syncError.retryAfterMs !== null
                ? Math.ceil(syncError.retryAfterMs / 1_000)
                : null,
          };
        }
      }),
    );
    results.push(...batchResults);
  }

  const { httpStatus, ...summary } = summarizeIfoodCronResults(results);
  const retryAfterSeconds = Math.max(0, ...results.map((result) =>
    typeof result.retryAfterSeconds === "number" ? result.retryAfterSeconds : 0,
  ));

  return NextResponse.json(
    {
      ...summary,
      integrationsChecked: queue.length,
      durationMs: Date.now() - startedAt,
      results,
    },
    {
      status: httpStatus,
      headers: retryAfterSeconds > 0 ? { "Retry-After": String(retryAfterSeconds) } : {},
    },
  );
  } finally {
    budget.dispose();
  }
}
