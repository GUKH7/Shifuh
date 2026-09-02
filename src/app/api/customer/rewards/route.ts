import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:customer:rewards",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) return NextResponse.json({ rewards: [] });

  const { data: customers } = await adminSupabase
    .from("customers")
    .select("id, restaurant_id")
    .eq("phone", context.phone);
  if (!customers?.length) return NextResponse.json({ rewards: [] });

  const customerIds = customers.map((customer: any) => customer.id);
  const { data: rewards, error } = await adminSupabase
    .from("customer_rewards")
    .select("id, restaurant_id, campaign_id, reward_type, label, percentage_value, fixed_amount, product_id, status, expires_at, redeemed_at, created_at")
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Falha ao carregar recompensas do cliente:", error);
    return NextResponse.json({ error: "Não foi possível carregar seus prêmios." }, { status: 503 });
  }

  const restaurantIds = [...new Set((rewards || []).map((reward: any) => reward.restaurant_id))];
  const productIds = [...new Set((rewards || []).map((reward: any) => reward.product_id).filter(Boolean))];

  const [{ data: restaurants }, { data: products }] = await Promise.all([
    restaurantIds.length
      ? adminSupabase.from("restaurants").select("id, name, slug, primary_color").in("id", restaurantIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? adminSupabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  const restaurantsById = new Map((restaurants || []).map((restaurant: any) => [restaurant.id, restaurant]));
  const productsById = new Map((products || []).map((product: any) => [product.id, product]));
  const now = Date.now();

  return NextResponse.json({
    rewards: (rewards || []).map((reward: any) => {
      const restaurant = restaurantsById.get(reward.restaurant_id) as any;
      const product = reward.product_id ? productsById.get(reward.product_id) as any : null;
      const expired = reward.status === "available" && reward.expires_at && new Date(reward.expires_at).getTime() <= now;
      return {
        id: reward.id,
        type: reward.reward_type,
        label: reward.label,
        percentageValue: reward.percentage_value == null ? null : Number(reward.percentage_value),
        fixedAmount: reward.fixed_amount == null ? null : Number(reward.fixed_amount),
        productId: reward.product_id,
        productName: product?.name || null,
        status: expired ? "expired" : reward.status,
        expiresAt: reward.expires_at,
        redeemedAt: reward.redeemed_at,
        createdAt: reward.created_at,
        restaurant: restaurant ? {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          primaryColor: restaurant.primary_color || "#ff6e1f",
        } : null,
      };
    }),
  });
}
