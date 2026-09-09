import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildLoyaltyPromotionSummary,
  buildWheelPromotionSummary,
} from "@/lib/promotions/storefront-promotion-summary";
import { createAdminClient } from "@/lib/supabase/server";

function emptySummary() {
  return { promotions: [] };
}

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:promotions:summary",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || "";
  if (!slug || slug.length > 160) {
    return NextResponse.json({ code: "INVALID_STORE", error: "Loja inválida." }, { status: 400 });
  }

  const adminSupabase = createAdminClient() as any;
  const { data: restaurant, error: restaurantError } = await adminSupabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (restaurantError) {
    console.error("Falha ao localizar loja para divulgação de promoções:", restaurantError);
    return NextResponse.json({ error: "Não foi possível carregar as promoções agora." }, { status: 503 });
  }
  if (!restaurant?.id) return NextResponse.json(emptySummary());

  const now = new Date().toISOString();
  const [loyaltyResult, wheelResult] = await Promise.all([
    adminSupabase
      .from("loyalty_programs")
      .select(
        "name, earning_mode, spend_amount, points_per_spend, points_per_order, minimum_order_amount",
      )
      .eq("restaurant_id", restaurant.id)
      .eq("status", "active")
      .maybeSingle(),
    adminSupabase
      .from("promotion_campaigns")
      .select("id, name, starts_at, ends_at")
      .eq("restaurant_id", restaurant.id)
      .eq("kind", "roulette")
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (loyaltyResult.error || wheelResult.error) {
    console.error(
      "Falha ao carregar promoções públicas da loja:",
      loyaltyResult.error || wheelResult.error,
    );
    return NextResponse.json({ error: "Não foi possível carregar as promoções agora." }, { status: 503 });
  }

  let wheelRules: any[] = [];
  if (wheelResult.data?.id) {
    const { data, error } = await adminSupabase
      .from("promotion_eligibility_rules")
      .select(
        "rule_type, enabled, threshold_amount, threshold_count, weekdays, start_time, end_time, max_spins, limit_period",
      )
      .eq("restaurant_id", restaurant.id)
      .eq("campaign_id", wheelResult.data.id)
      .eq("enabled", true);

    if (error) {
      console.error("Falha ao carregar regras públicas da Roleta:", error);
      return NextResponse.json({ error: "Não foi possível carregar as promoções agora." }, { status: 503 });
    }
    wheelRules = data || [];
  }

  const promotions = [
    buildLoyaltyPromotionSummary(loyaltyResult.data),
    buildWheelPromotionSummary(wheelResult.data?.name, wheelRules),
  ].filter(Boolean);

  return NextResponse.json(
    { promotions },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
