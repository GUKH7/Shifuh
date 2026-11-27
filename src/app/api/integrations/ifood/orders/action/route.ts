import { assertIfoodMerchantBinding, IfoodMerchantConflictError } from "@/lib/ifood/merchant-isolation";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  confirmIfoodOrder,
  dispatchIfoodOrder,
  getIfoodCancellationReasons,
  readyToPickupIfoodOrder,
  requestIfoodOrderCancellation,
} from "@/lib/ifood/orders";

type IfoodOrderAction =
  | "confirm"
  | "dispatch"
  | "ready_to_pickup"
  | "cancellation_reasons"
  | "request_cancellation";

type ActionPayload = {
  orderId?: string;
  action?: IfoodOrderAction;
  cancellationCode?: string;
  reason?: string;
};

async function getOwnedIfoodOrder(localOrderId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, restaurant_id, external_source, external_order_id, status")
    .eq("id", localOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return {
      error: NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 }),
    };
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", order.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (restaurantError || !restaurant) {
    return {
      error: NextResponse.json({ error: "Acesso negado ao pedido." }, { status: 403 }),
    };
  }

  if (order.external_source !== "ifood" || !order.external_order_id) {
    return {
      error: NextResponse.json(
        { error: "Este pedido não está vinculado a um pedido iFood." },
        { status: 400 },
      ),
    };
  }

  return { order };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActionPayload;
    const localOrderId = body.orderId?.trim();
    const action = body.action;

    if (!localOrderId || !action) {
      return NextResponse.json({ error: "Informe pedido e ação." }, { status: 400 });
    }

    const lookup = await getOwnedIfoodOrder(localOrderId);
    if (lookup.error) return lookup.error;

    const order = lookup.order;
    const ifoodOrderId = order.external_order_id;
    if (!ifoodOrderId) {
      return NextResponse.json(
        { error: "Pedido iFood sem external_order_id." },
        { status: 400 },
      );
    }
    const admin = createAdminClient();
    const { data: integration, error: bindingError } = await admin.from("ifood_integrations")
      .select("merchant_id, order_sync_enabled")
      .eq("restaurant_id", order.restaurant_id)
      .maybeSingle();
    if (bindingError) throw new Error("Não foi possível verificar o vínculo iFood.");
    if (!integration?.merchant_id || !integration.order_sync_enabled) throw new IfoodMerchantConflictError();
    await assertIfoodMerchantBinding(admin, order.restaurant_id, integration.merchant_id);
    const { data: linkedEvents, error: linkedError } = await admin.from("ifood_order_events")
      .select("id")
      .eq("restaurant_id", order.restaurant_id)
      .eq("local_order_id", order.id)
      .eq("ifood_order_id", ifoodOrderId)
      .eq("merchant_id", integration.merchant_id)
      .limit(1);
    if (linkedError) throw new Error("Não foi possível verificar a origem do pedido iFood.");
    if (!linkedEvents?.length) throw new IfoodMerchantConflictError();

    if (action === "cancellation_reasons") {
      const reasons = await getIfoodCancellationReasons(ifoodOrderId);
      return NextResponse.json({ ok: true, reasons });
    }

    if (action === "confirm") {
      await confirmIfoodOrder(ifoodOrderId);
      await admin.from("orders").update({ status: "preparing" }).eq("id", order.id).eq("restaurant_id", order.restaurant_id);
      return NextResponse.json({ ok: true, status: "preparing" });
    }

    if (action === "dispatch") {
      await dispatchIfoodOrder(ifoodOrderId);
      await admin.from("orders").update({ status: "delivering" }).eq("id", order.id).eq("restaurant_id", order.restaurant_id);
      return NextResponse.json({ ok: true, status: "delivering" });
    }

    if (action === "ready_to_pickup") {
      await readyToPickupIfoodOrder(ifoodOrderId);
      await admin.from("orders").update({ status: "preparing" }).eq("id", order.id).eq("restaurant_id", order.restaurant_id);
      return NextResponse.json({ ok: true, status: "preparing" });
    }

    if (action === "request_cancellation") {
      const cancellationCode = body.cancellationCode?.trim();
      const reason = body.reason?.trim();

      if (!cancellationCode || !reason) {
        return NextResponse.json(
          { error: "Escolha um código e informe o motivo do cancelamento." },
          { status: 400 },
        );
      }

      const cancellation = await requestIfoodOrderCancellation(
        ifoodOrderId,
        cancellationCode,
        reason,
      );

      await admin
        .from("orders")
        .update({ cancellation_reason: reason })
        .eq("id", order.id).eq("restaurant_id", order.restaurant_id);

      return NextResponse.json({ ok: true, cancellation });
    }

    return NextResponse.json({ error: "Ação iFood inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof IfoodMerchantConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Erro ao executar ação de pedido iFood:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível executar a ação do pedido no iFood.",
      },
      { status: 500 },
    );
  }
}
