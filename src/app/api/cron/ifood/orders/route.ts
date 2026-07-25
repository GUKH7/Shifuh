import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncIfoodOrdersWithResilience } from "@/lib/ifood/order-sync-resilience";
import { getIfoodMerchantStatus } from "@/lib/ifood/merchant";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_CONCURRENCY = 3;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function processIntegration(integration: {
  restaurant_id: string | null;
  merchant_id: string | null;
  order_sync_enabled: boolean | null;
}) {
  if (!integration.restaurant_id || !integration.merchant_id) return null;

  const startedAt = Date.now();

  try {
    const merchantStatus = await getIfoodMerchantStatus(integration.merchant_id);
    const orderSummary = integration.order_sync_enabled
      ? await syncIfoodOrdersWithResilience({
          restaurantId: integration.restaurant_id,
          merchantId: integration.merchant_id,
          source: "cron",
          maxAttempts: 3,
        })
      : null;

    return {
      restaurantId: integration.restaurant_id,
      ok: true,
      durationMs: Date.now() - startedAt,
      merchantStatus,
      orderSummary,
    };
  } catch (syncError) {
    console.error(
      `Erro no cron de pedidos iFood da loja ${integration.restaurant_id}:`,
      syncError,
    );

    return {
      restaurantId: integration.restaurant_id,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: syncError instanceof Error ? syncError.message : "Falha ao sincronizar.",
    };
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const cronStartedAt = Date.now();
  const admin = createAdminClient();
  const { data: integrations, error } = await admin
    .from("ifood_integrations")
    .select("restaurant_id, merchant_id, order_sync_enabled")
    .not("merchant_id", "is", null);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Não foi possível listar integrações iFood." },
      { status: 500 },
    );
  }

  const candidates = (integrations || []).filter(
    (integration) => integration.restaurant_id && integration.merchant_id,
  );
  const results: Array<Awaited<ReturnType<typeof processIntegration>>> = [];

  for (let index = 0; index < candidates.length; index += CRON_CONCURRENCY) {
    const batch = candidates.slice(index, index + CRON_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(processIntegration));
    results.push(...batchResults);
  }

  const validResults = results.filter(Boolean);
  const failed = validResults.filter((result) => result && !result.ok).length;

  return NextResponse.json({
    ok: failed === 0,
    status: failed === 0 ? "success" : failed === validResults.length ? "error" : "partial_success",
    durationMs: Date.now() - cronStartedAt,
    integrationsChecked: candidates.length,
    integrationsSucceeded: validResults.length - failed,
    integrationsFailed: failed,
    results: validResults,
  });
}
