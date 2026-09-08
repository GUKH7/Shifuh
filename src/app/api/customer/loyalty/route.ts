import { NextResponse } from "next/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "customer:loyalty:read",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) {
    return NextResponse.json(
      { code: "LOYALTY_SESSION_REQUIRED", error: "Confirme seu telefone para acessar o programa de fidelidade." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const restaurantId = url.searchParams.get("restaurantId")?.trim() || "";
  if (restaurantId && !UUID_PATTERN.test(restaurantId)) {
    return NextResponse.json({ code: "INVALID_RESTAURANT", error: "Loja inválida." }, { status: 400 });
  }

  let customerQuery = adminSupabase
    .from("customers")
    .select("id, restaurant_id")
    .eq("phone", context.phone);
  if (restaurantId) customerQuery = customerQuery.eq("restaurant_id", restaurantId);

  const { data: customers, error: customerError } = await customerQuery;
  if (customerError) {
    console.error("Falha ao localizar cliente da fidelidade:", customerError);
    return NextResponse.json({ error: "Não foi possível carregar sua fidelidade agora." }, { status: 503 });
  }
  if (!customers?.length) return NextResponse.json({ programs: [] });

  const restaurantIds = [...new Set(customers.map((customer: any) => customer.restaurant_id))];
  const customerIds = customers.map((customer: any) => customer.id);

  const [{ data: programs, error: programError }, { data: restaurants }] = await Promise.all([
    adminSupabase
      .from("loyalty_programs")
      .select("id, restaurant_id, name, status")
      .in("restaurant_id", restaurantIds)
      .eq("status", "active"),
    adminSupabase
      .from("restaurants")
      .select("id, name, slug, primary_color")
      .in("id", restaurantIds),
  ]);

  if (programError) {
    console.error("Falha ao carregar programas de fidelidade:", programError);
    return NextResponse.json({ error: "Não foi possível carregar sua fidelidade agora." }, { status: 503 });
  }
  if (!programs?.length) return NextResponse.json({ programs: [] });

  const programIds = programs.map((program: any) => program.id);
  const [{ data: accounts, error: accountError }, { data: rewards, error: rewardError }] = await Promise.all([
    adminSupabase
      .from("loyalty_accounts")
      .select("id, restaurant_id, program_id, customer_id, points_balance, lifetime_earned, lifetime_redeemed, lifetime_expired")
      .in("program_id", programIds)
      .in("customer_id", customerIds),
    adminSupabase
      .from("loyalty_rewards")
      .select("id, restaurant_id, program_id, name, description, reward_type, points_cost, percentage_value, fixed_amount, product_id, minimum_order_amount, reward_validity_days, max_redemptions_total, sort_order")
      .in("program_id", programIds)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (accountError || rewardError) {
    console.error("Falha ao carregar carteira/catálogo de fidelidade:", accountError || rewardError);
    return NextResponse.json({ error: "Não foi possível carregar sua fidelidade agora." }, { status: 503 });
  }

  const restaurantsById = new Map((restaurants || []).map((restaurant: any) => [restaurant.id, restaurant]));
  const customerByRestaurant = new Map(customers.map((customer: any) => [customer.restaurant_id, customer.id]));
  const accountByProgramCustomer = new Map(
    (accounts || []).map((account: any) => [`${account.program_id}:${account.customer_id}`, account]),
  );
  const rewardsByProgram = new Map<string, any[]>();
  for (const reward of rewards || []) {
    const list = rewardsByProgram.get(reward.program_id) || [];
    list.push(reward);
    rewardsByProgram.set(reward.program_id, list);
  }

  return NextResponse.json({
    programs: programs.map((program: any) => {
      const customerId = customerByRestaurant.get(program.restaurant_id);
      const account = customerId ? accountByProgramCustomer.get(`${program.id}:${customerId}`) as any : null;
      const balance = Number(account?.points_balance || 0);
      const restaurant = restaurantsById.get(program.restaurant_id) as any;
      return {
        id: program.id,
        name: program.name,
        restaurant: restaurant ? {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          primaryColor: restaurant.primary_color || "#ff6e1f",
        } : null,
        account: {
          id: account?.id || null,
          balance,
          lifetimeEarned: Number(account?.lifetime_earned || 0),
          lifetimeRedeemed: Number(account?.lifetime_redeemed || 0),
          lifetimeExpired: Number(account?.lifetime_expired || 0),
        },
        rewards: (rewardsByProgram.get(program.id) || []).map((reward: any) => ({
          id: reward.id,
          name: reward.name,
          description: reward.description,
          type: reward.reward_type,
          pointsCost: Number(reward.points_cost || 0),
          percentageValue: reward.percentage_value == null ? null : Number(reward.percentage_value),
          fixedAmount: reward.fixed_amount == null ? null : Number(reward.fixed_amount),
          productId: reward.product_id,
          minimumOrderAmount: Number(reward.minimum_order_amount || 0),
          rewardValidityDays: reward.reward_validity_days,
          maxRedemptionsTotal: reward.max_redemptions_total,
          canRedeem: Boolean(account && balance >= Number(reward.points_cost || 0)),
        })),
      };
    }),
  });
}
