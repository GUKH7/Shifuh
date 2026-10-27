import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncIfoodOrdersForRestaurant } from "@/lib/ifood/order-sync";
import { getIfoodMerchantStatus } from "@/lib/ifood/merchant";
import { summarizeIfoodCronResults } from "@/lib/ifood/cron-result";
import { createIfoodCronBudget } from "@/lib/ifood/cron-budget";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const results = [];

  for (const integration of integrations || []) {
    if (!integration.restaurant_id || !integration.merchant_id) continue;
    if (!budget.canStart()) {
      results.push({ restaurantId: integration.restaurant_id, ok: false,
        error: "Orçamento do cron insuficiente; integração adiada." });
      continue;
    }

    try {
      const merchantStatus = await getIfoodMerchantStatus(integration.merchant_id, budget.signal);
      const orderSummary = integration.order_sync_enabled
        ? await syncIfoodOrdersForRestaurant({
            restaurantId: integration.restaurant_id,
            merchantId: integration.merchant_id,
            source: "cron",
            signal: budget.signal,
          })
        : null;

      results.push({
        restaurantId: integration.restaurant_id,
        ok: true,
        merchantStatus,
        orderSummary,
      });
    } catch (syncError) {
      console.error(
        `Erro no cron de pedidos iFood da loja ${integration.restaurant_id}:`,
        syncError,
      );

      results.push({
        restaurantId: integration.restaurant_id,
        ok: false,
        error: syncError instanceof Error ? syncError.message : "Falha ao sincronizar.",
      });
    }
  }

  const { httpStatus, ...summary } = summarizeIfoodCronResults(results);

  return NextResponse.json(
    {
      ...summary,
      integrationsChecked: integrations?.length || 0,
      durationMs: Date.now() - startedAt,
      results,
    },
    { status: httpStatus },
  );
  } finally {
    budget.dispose();
  }
}
