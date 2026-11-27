import { isIfoodOrdersOnly, isIfoodCutoverPaused } from "@/lib/ifood/capabilities";
import { assertIfoodMerchantBinding, IfoodMerchantConflictError } from "@/lib/ifood/merchant-isolation";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { IfoodApiError } from "@/lib/ifood/orders";
import { syncIfoodOrdersForRestaurant } from "@/lib/ifood/order-sync";

type SyncPayload = {
  restaurantId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncPayload;
    const restaurantId = body.restaurantId?.trim();

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: ownedRestaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, user_id")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !ownedRestaurant) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    if (isIfoodCutoverPaused()) return NextResponse.json({ error: "Integração iFood em manutenção." }, { status: 503 });
    const admin = createAdminClient();
    const { data: integration, error: integrationError } = await admin
      .from("ifood_integrations")
      .select("merchant_id, status, order_sync_enabled")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (integrationError || !integration || !integration.merchant_id) {
      return NextResponse.json(
        { error: "Configure o merchant do iFood antes de sincronizar pedidos." },
        { status: 400 },
      );
    }

    if (isIfoodOrdersOnly() && !integration.order_sync_enabled) return NextResponse.json({ error: "Sincronização oficial ainda não ativada." }, { status: 409 });
    await assertIfoodMerchantBinding(admin, restaurantId, integration.merchant_id);
    const summary = await syncIfoodOrdersForRestaurant({
      restaurantId,
      merchantId: integration.merchant_id,
      source: "manual",
    });

    // Official mode must not re-enable a binding paused during the request.
    if (isIfoodOrdersOnly()) return NextResponse.json({ ok: true, summary });

    const { error: enableError } = await admin
      .from("ifood_integrations")
      .update({
        order_sync_enabled: true,
        ...(integration.status === "disconnected" ? { status: "configuring" } : {}),
      })
      .eq("restaurant_id", restaurantId)
      .eq("merchant_id", integration.merchant_id);

    if (enableError) {
      if (enableError.code === "23505") throw new IfoodMerchantConflictError();
      throw new Error("Não foi possível habilitar a sincronização iFood.");
    }

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    if (error instanceof IfoodMerchantConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Erro ao sincronizar pedidos do iFood:", error);

    if (error instanceof IfoodApiError && error.status === 400) {
      return NextResponse.json(
        {
          error:
            "O iFood rejeitou o polling de pedidos com Bad Request. Isso normalmente acontece quando o app ainda não tem liberação efetiva para Order/Events, quando a loja de teste não está pronta para esse módulo, ou quando o merchant usado não é aceito nesse endpoint.",
          details: error.responseBody,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar os pedidos do iFood.",
      },
      { status: 500 },
    );
  }
}
