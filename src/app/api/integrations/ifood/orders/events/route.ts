import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localOrderId = searchParams.get("orderId")?.trim();

  if (!localOrderId) {
    return NextResponse.json({ error: "Informe o pedido." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "NÃ£o autenticado." }, { status: 401 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, restaurant_id, external_source, external_order_id")
    .eq("id", localOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Pedido nÃ£o encontrado." }, { status: 404 });
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", order.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Acesso negado ao pedido." }, { status: 403 });
  }

  if (order.external_source !== "ifood" || !order.external_order_id) {
    return NextResponse.json({ error: "Este pedido nÃ£o Ã© do iFood." }, { status: 400 });
  }

  const { data: events, error: eventsError } = await supabase
    .from("ifood_order_events")
    .select(
      "id, ifood_event_id, ifood_order_id, event_code, event_full_code, event_group, event_created_at, processed_at, acknowledged_at, raw_payload, created_at",
    )
    .eq("restaurant_id", order.restaurant_id)
    .eq("ifood_order_id", order.external_order_id)
    .order("event_created_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventsError) {
    return NextResponse.json(
      { error: eventsError.message || "NÃ£o foi possÃ­vel listar os eventos iFood." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, events: events || [] });
}
