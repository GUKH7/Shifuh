import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";

function firstRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:promotions:wheel:eligibility",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!slug || !orderId) {
    return NextResponse.json({ error: "Pedido ou loja inválidos." }, { status: 400 });
  }

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) return NextResponse.json({ spin: null }, { status: 200 });

  const { data: restaurant } = await adminSupabase
    .from("restaurants")
    .select("id, primary_color, deleted_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!restaurant) return NextResponse.json({ spin: null }, { status: 200 });

  const { data: order } = await adminSupabase
    .from("orders")
    .select("id, restaurant_id, customer_phone, user_id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ spin: null }, { status: 200 });

  const phoneMatches = String(order.customer_phone || "").replace(/\D/g, "") === context.phone;
  const userMatches = Boolean(order.user_id && order.user_id === context.authUserId);
  if (!phoneMatches && !userMatches) {
    return NextResponse.json({ error: "Este pedido não pertence à sessão atual." }, { status: 403 });
  }

  const { data: customer } = await adminSupabase
    .from("customers")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("phone", String(order.customer_phone || "").replace(/\D/g, ""))
    .maybeSingle();
  if (!customer) return NextResponse.json({ spin: null }, { status: 200 });

  const { data: granted, error: grantError } = await adminSupabase.rpc("grant_eligible_promotion_spin", {
    p_restaurant_id: restaurant.id,
    p_customer_id: customer.id,
    p_order_id: order.id,
  });
  if (grantError) {
    console.error("Falha ao avaliar elegibilidade da roleta:", grantError);
    return NextResponse.json({ error: "Não foi possível conferir seu giro agora." }, { status: 503 });
  }

  const spin = firstRow<any>(granted);
  if (!spin) return NextResponse.json({ spin: null }, { status: 200 });

  const { data: prizes } = await adminSupabase
    .from("promotion_prizes")
    .select("id, label, prize_type, sort_order")
    .eq("restaurant_id", restaurant.id)
    .eq("campaign_id", spin.campaign_id)
    .eq("active", true)
    .order("sort_order")
    .order("id");

  return NextResponse.json({
    spin: {
      id: spin.spin_id,
      campaignId: spin.campaign_id,
      campaignName: spin.campaign_name,
    },
    segments: (prizes || []).map((prize: any) => ({
      id: prize.id,
      label: prize.label,
      type: prize.prize_type,
    })),
    primaryColor: restaurant.primary_color || "#ff6e1f",
  });
}
