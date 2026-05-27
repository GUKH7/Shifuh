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

    const admin = createAdminClient();
    const { data: integration, error: integrationError } = await admin
      .from("ifood_integrations")
      .select("merchant_id, status")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (integrationError || !integration || !integration.merchant_id) {
      return NextResponse.json(
        { error: "Configure o merchant do iFood antes de sincronizar pedidos." },
        { status: 400 },
      );
    }

    const summary = await syncIfoodOrdersForRestaurant({
      restaurantId,
      merchantId: integration.merchant_id,
      source: "manual",
    });

    if (integration.status === "disconnected") {
      await admin
        .from("ifood_integrations")
        .update({ status: "configuring" })
        .eq("restaurant_id", restaurantId);
    }

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
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
