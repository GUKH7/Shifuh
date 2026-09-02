import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";

async function getRestaurant(adminSupabase: any, slug: string) {
  const { data } = await adminSupabase
    .from("restaurants")
    .select("id, primary_color, deleted_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

async function getCustomer(adminSupabase: any, restaurantId: string, phone: string) {
  const { data } = await adminSupabase
    .from("customers")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();
  return data;
}

async function serializePendingSpin(adminSupabase: any, restaurantId: string, customerId: string) {
  const { data: spin } = await adminSupabase
    .from("promotion_spins")
    .select("id, campaign_id, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("customer_id", customerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!spin) return null;

  const [{ data: campaign }, { data: prizes }] = await Promise.all([
    adminSupabase
      .from("promotion_campaigns")
      .select("name, status, starts_at, ends_at")
      .eq("id", spin.campaign_id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    adminSupabase
      .from("promotion_prizes")
      .select("id, label, prize_type, sort_order")
      .eq("restaurant_id", restaurantId)
      .eq("campaign_id", spin.campaign_id)
      .eq("active", true)
      .order("sort_order")
      .order("id"),
  ]);

  const now = Date.now();
  const active = campaign?.status === "active"
    && new Date(campaign.starts_at).getTime() <= now
    && new Date(campaign.ends_at).getTime() > now;
  if (!active) return null;

  return {
    spin: {
      id: spin.id,
      campaignId: spin.campaign_id,
      campaignName: campaign.name,
    },
    segments: (prizes || []).map((prize: any) => ({
      id: prize.id,
      label: prize.label,
      type: prize.prize_type,
    })),
  };
}

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:promotions:wheel:state",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || "";
  if (!slug) return NextResponse.json({ spin: null }, { status: 200 });

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) return NextResponse.json({ spin: null }, { status: 200 });

  const restaurant = await getRestaurant(adminSupabase, slug);
  if (!restaurant) return NextResponse.json({ spin: null }, { status: 200 });
  const customer = await getCustomer(adminSupabase, restaurant.id, context.phone);
  if (!customer) return NextResponse.json({ spin: null }, { status: 200 });

  const state = await serializePendingSpin(adminSupabase, restaurant.id, customer.id);
  return NextResponse.json({
    ...(state || { spin: null, segments: [] }),
    primaryColor: restaurant.primary_color || "#ff6e1f",
  });
}

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:promotions:wheel:resolve",
    limit: 8,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => ({}));
  const spinId = typeof body.spinId === "string" ? body.spinId.trim() : "";
  if (!spinId) return NextResponse.json({ error: "Giro inválido." }, { status: 400 });

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) return NextResponse.json({ error: "Sessão do cliente não encontrada." }, { status: 401 });

  const { data: spin } = await adminSupabase
    .from("promotion_spins")
    .select("id, restaurant_id, customer_id, campaign_id")
    .eq("id", spinId)
    .maybeSingle();
  if (!spin) return NextResponse.json({ error: "Giro não encontrado." }, { status: 404 });

  const { data: customer } = await adminSupabase
    .from("customers")
    .select("phone")
    .eq("id", spin.customer_id)
    .eq("restaurant_id", spin.restaurant_id)
    .maybeSingle();
  if (!customer || String(customer.phone).replace(/\D/g, "") !== context.phone) {
    return NextResponse.json({ error: "Este giro não pertence à sessão atual." }, { status: 403 });
  }

  const { data: resolved, error: resolveError } = await adminSupabase.rpc("resolve_promotion_spin", {
    p_spin_id: spin.id,
  });
  if (resolveError) {
    console.error("Falha ao resolver giro promocional:", resolveError);
    return NextResponse.json({ error: "Não foi possível concluir o giro agora." }, { status: 409 });
  }

  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  if (!row) return NextResponse.json({ error: "Resultado do giro não encontrado." }, { status: 500 });

  let productName: string | null = null;
  if (row.product_id) {
    const { data: product } = await adminSupabase
      .from("products")
      .select("name")
      .eq("id", row.product_id)
      .eq("restaurant_id", spin.restaurant_id)
      .maybeSingle();
    productName = product?.name || null;
  }

  return NextResponse.json({
    result: {
      spinId: row.spin_id,
      resultId: row.result_id,
      prizeId: row.prize_id,
      type: row.prize_type,
      label: row.prize_label,
      percentageValue: row.percentage_value == null ? null : Number(row.percentage_value),
      fixedAmount: row.fixed_amount == null ? null : Number(row.fixed_amount),
      productId: row.product_id,
      productName,
      rewardId: row.reward_id,
      rewardExpiresAt: row.reward_expires_at,
    },
  });
}
