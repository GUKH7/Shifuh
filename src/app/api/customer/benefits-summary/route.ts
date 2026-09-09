import { NextResponse } from "next/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

function zeroSummary() {
  return { pointsBalance: 0, availableRewards: 0 };
}

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "customer:benefits-summary:read",
    limit: 45,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || "";
  if (!slug || slug.length > 160) {
    return NextResponse.json({ code: "INVALID_STORE", error: "Loja inválida." }, { status: 400 });
  }

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) {
    return NextResponse.json(
      { code: "BENEFITS_SESSION_REQUIRED", error: "Confirme seu telefone para acessar seus benefícios." },
      { status: 401 },
    );
  }

  const { data: restaurant, error: restaurantError } = await adminSupabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .single();

  if (restaurantError || !restaurant?.id) {
    if (restaurantError?.code === "PGRST116") {
      return NextResponse.json({ code: "STORE_NOT_FOUND", error: "Loja não encontrada." }, { status: 404 });
    }
    console.error("Falha ao localizar loja para resumo de benefícios:", restaurantError);
    return NextResponse.json({ error: "Não foi possível carregar seus benefícios agora." }, { status: 503 });
  }

  const { data: customers, error: customerError } = await adminSupabase.rpc(
    "find_loyalty_customers_by_phone",
    {
      p_customer_phone: context.phone,
      p_restaurant_id: restaurant.id,
    },
  );

  if (customerError) {
    console.error("Falha ao localizar cliente para resumo de benefícios:", customerError);
    return NextResponse.json({ error: "Não foi possível carregar seus benefícios agora." }, { status: 503 });
  }
  if (!customers?.length) return NextResponse.json(zeroSummary());

  const customerIds = [...new Set(customers.map((customer: any) => customer.id))];
  const { data: programs, error: programError } = await adminSupabase
    .from("loyalty_programs")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active");

  if (programError) {
    console.error("Falha ao localizar programa para resumo de benefícios:", programError);
    return NextResponse.json({ error: "Não foi possível carregar seus benefícios agora." }, { status: 503 });
  }

  const programIds = (programs || []).map((program: any) => program.id);
  const [accountsResult, rewardsResult] = await Promise.all([
    programIds.length
      ? adminSupabase
          .from("loyalty_accounts")
          .select("points_balance")
          .in("program_id", programIds)
          .in("customer_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    adminSupabase
      .from("customer_rewards")
      .select("id, expires_at")
      .eq("restaurant_id", restaurant.id)
      .in("customer_id", customerIds)
      .eq("status", "available"),
  ]);

  if (accountsResult.error || rewardsResult.error) {
    console.error(
      "Falha ao carregar saldo/prêmios do resumo de benefícios:",
      accountsResult.error || rewardsResult.error,
    );
    return NextResponse.json({ error: "Não foi possível carregar seus benefícios agora." }, { status: 503 });
  }

  const pointsBalance = (accountsResult.data || []).reduce(
    (total: number, account: any) => total + Number(account.points_balance || 0),
    0,
  );
  const now = Date.now();
  const availableRewards = (rewardsResult.data || []).filter(
    (reward: any) => !reward.expires_at || new Date(reward.expires_at).getTime() > now,
  ).length;

  return NextResponse.json({ pointsBalance, availableRewards });
}
