import { NextResponse } from "next/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORY_LIMIT_PER_ACCOUNT = 20;

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

  const { data: customers, error: customerError } = await adminSupabase.rpc(
    "find_loyalty_customers_by_phone",
    {
      p_customer_phone: context.phone,
      p_restaurant_id: restaurantId || null,
    },
  );

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

  const accountIds = (accounts || []).map((account: any) => account.id);
  const rewardIds = (rewards || []).map((reward: any) => reward.id);
  const productIds = [...new Set((rewards || []).map((reward: any) => reward.product_id).filter(Boolean))];

  const [redemptionCapacityResult, productResult, accountHistoryResults] = await Promise.all([
    rewardIds.length > 0
      ? adminSupabase.from("loyalty_redemptions").select("reward_id").in("reward_id", rewardIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? adminSupabase
          .from("products")
          .select("id, restaurant_id, name")
          .in("id", productIds)
          .in("restaurant_id", restaurantIds)
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      accountIds.map(async (accountId: string) => {
        const [transactionResult, redemptionHistoryResult] = await Promise.all([
          adminSupabase
            .from("loyalty_point_transactions")
            .select("id, account_id, transaction_type, points_delta, balance_after, source_order_id, description, expires_at, created_at")
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(HISTORY_LIMIT_PER_ACCOUNT),
          adminSupabase
            .from("loyalty_redemptions")
            .select("id, account_id, reward_id, reward_type, label, points_spent, balance_after, status, expires_at, redeemed_at, redeemed_order_id, created_at")
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(HISTORY_LIMIT_PER_ACCOUNT),
        ]);

        return {
          accountId,
          transactions: transactionResult.data || [],
          redemptions: redemptionHistoryResult.data || [],
          error: transactionResult.error || redemptionHistoryResult.error,
        };
      }),
    ),
  ]);

  const historyError = accountHistoryResults.find((result) => result.error)?.error;
  const secondaryError = redemptionCapacityResult.error || productResult.error || historyError;
  if (secondaryError) {
    console.error("Falha ao carregar histórico/capacidade da fidelidade:", secondaryError);
    return NextResponse.json({ error: "Não foi possível carregar sua fidelidade agora." }, { status: 503 });
  }

  const redemptionCountByReward = new Map<string, number>();
  for (const redemption of redemptionCapacityResult.data || []) {
    redemptionCountByReward.set(
      redemption.reward_id,
      (redemptionCountByReward.get(redemption.reward_id) || 0) + 1,
    );
  }

  const productsById = new Map((productResult.data || []).map((product: any) => [product.id, product]));
  const transactionsByAccount = new Map<string, any[]>();
  const redemptionsByAccount = new Map<string, any[]>();
  for (const result of accountHistoryResults) {
    transactionsByAccount.set(result.accountId, result.transactions);
    redemptionsByAccount.set(result.accountId, result.redemptions);
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

  const now = Date.now();

  return NextResponse.json({
    programs: programs.map((program: any) => {
      const customerId = customerByRestaurant.get(program.restaurant_id);
      const account = customerId ? accountByProgramCustomer.get(`${program.id}:${customerId}`) as any : null;
      const balance = Number(account?.points_balance || 0);
      const restaurant = restaurantsById.get(program.restaurant_id) as any;
      const accountTransactions = account ? transactionsByAccount.get(account.id) || [] : [];
      const accountRedemptions = account ? redemptionsByAccount.get(account.id) || [] : [];

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
        rewards: (rewardsByProgram.get(program.id) || []).map((reward: any) => {
          const redemptionsTotal = redemptionCountByReward.get(reward.id) || 0;
          const maxRedemptionsTotal = reward.max_redemptions_total == null
            ? null
            : Number(reward.max_redemptions_total);
          const remainingRedemptions = maxRedemptionsTotal == null
            ? null
            : Math.max(0, maxRedemptionsTotal - redemptionsTotal);
          const hasCapacity = remainingRedemptions == null || remainingRedemptions > 0;
          const pointsCost = Number(reward.points_cost || 0);
          const product = reward.product_id ? productsById.get(reward.product_id) as any : null;

          return {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            type: reward.reward_type,
            pointsCost,
            percentageValue: reward.percentage_value == null ? null : Number(reward.percentage_value),
            fixedAmount: reward.fixed_amount == null ? null : Number(reward.fixed_amount),
            productId: reward.product_id,
            productName: product?.name || null,
            minimumOrderAmount: Number(reward.minimum_order_amount || 0),
            rewardValidityDays: reward.reward_validity_days,
            maxRedemptionsTotal,
            redemptionsTotal,
            remainingRedemptions,
            canRedeem: Boolean(account && balance >= pointsCost && hasCapacity),
          };
        }),
        transactions: accountTransactions.map((transaction: any) => ({
          id: transaction.id,
          type: transaction.transaction_type,
          pointsDelta: Number(transaction.points_delta || 0),
          balanceAfter: Number(transaction.balance_after || 0),
          sourceOrderId: transaction.source_order_id,
          description: transaction.description,
          expiresAt: transaction.expires_at,
          createdAt: transaction.created_at,
        })),
        redemptions: accountRedemptions.map((redemption: any) => {
          const expired = redemption.status === "available"
            && redemption.expires_at
            && new Date(redemption.expires_at).getTime() <= now;

          return {
            id: redemption.id,
            rewardId: redemption.reward_id,
            type: redemption.reward_type,
            label: redemption.label,
            pointsSpent: Number(redemption.points_spent || 0),
            balanceAfter: Number(redemption.balance_after || 0),
            status: expired ? "expired" : redemption.status,
            expiresAt: redemption.expires_at,
            redeemedAt: redemption.redeemed_at,
            redeemedOrderId: redemption.redeemed_order_id,
            createdAt: redemption.created_at,
          };
        }),
      };
    }),
  });
}
