import { NextResponse } from "next/server";
import { sendWhatsappMessage } from "@/lib/whatsapp-bot";
import { createClient } from "@/lib/supabase/server";

type OrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

type Params = {
  params: {
    id: string;
  };
};

const ALLOWED_STATUSES: OrderStatus[] = ["pending", "preparing", "delivering", "done", "canceled"];

function formatDisplayNumber(order: { display_number?: number | null; id: string }) {
  if (order.display_number) {
    return String(order.display_number).padStart(4, "0");
  }

  return order.id.slice(0, 4).toUpperCase();
}

function getStatusLabel(status: OrderStatus) {
  switch (status) {
    case "pending":
      return "confirmado";
    case "preparing":
      return "em preparo";
    case "delivering":
      return "em rota para entrega";
    case "done":
      return "concluído";
    case "canceled":
      return "cancelado";
    default:
      return status;
  }
}

function buildStatusMessage(order: {
  id: string;
  display_number?: number | null;
  customer_name: string;
  status: OrderStatus;
  restaurant?: { name?: string | null } | null;
}) {
  const storeName = order.restaurant?.name || "a loja";
  const displayNumber = formatDisplayNumber(order);
  const statusLabel = getStatusLabel(order.status);

  return [
    `Olá, ${order.customer_name}!`,
    `Seu pedido #${displayNumber} está ${statusLabel}.`,
    `Atenciosamente, ${storeName}.`,
  ].join("\n");
}

export async function PATCH(request: Request, context: Params) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json()) as { status?: OrderStatus; notifyCustomer?: boolean };
    const nextStatus = body.status;

    if (!nextStatus || !ALLOWED_STATUSES.includes(nextStatus)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const { id } = context.params;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, restaurant_id, customer_name, customer_phone, status, display_number")
      .eq("id", id)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("id", order.restaurant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: "Acesso negado ao pedido." }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Não foi possível atualizar o pedido." },
        { status: 400 },
      );
    }

    const updatedOrder = {
      ...order,
      status: nextStatus,
      restaurant,
    };
    let notification = {
      sent: false,
      skipped: body.notifyCustomer === false,
      error: "" as string | undefined,
    };

    if (body.notifyCustomer !== false) {
      const result = await sendWhatsappMessage({
        phone: order.customer_phone,
        message: buildStatusMessage(updatedOrder),
        orderId: order.id,
        status: nextStatus,
      });

      notification = {
        sent: result.ok,
        skipped: result.skipped,
        error: result.error,
      };

      if (!result.ok) {
        console.error("Falha ao enviar WhatsApp de status:", result.error);
      }
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        status: nextStatus,
      },
      notification,
    });
  } catch (error) {
    console.error("Erro ao atualizar status do pedido:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar status do pedido." }, { status: 500 });
  }
}
