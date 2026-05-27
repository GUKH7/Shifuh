import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncIfoodOrdersForRestaurant } from "@/lib/ifood/order-sync";

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

  const admin = createAdminClient();
  const { data: integrations, error } = await admin
    .from("ifood_integrations")
    .select("restaurant_id, merchant_id")
    .eq("order_sync_enabled", true)
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

    try {
      const summary = await syncIfoodOrdersForRestaurant({
        restaurantId: integration.restaurant_id,
        merchantId: integration.merchant_id,
        source: "cron",
      });

      results.push({
        restaurantId: integration.restaurant_id,
        ok: true,
        summary,
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

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    integrationsChecked: integrations?.length || 0,
    results,
  });
}
