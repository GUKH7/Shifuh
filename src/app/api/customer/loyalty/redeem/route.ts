import { NextResponse } from "next/server";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redemptionError(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("insufficient loyalty points")) {
    return { code: "LOYALTY_INSUFFICIENT_POINTS", status: 409, message: "Você ainda não possui pontos suficientes para esta recompensa." };
  }
  if (normalized.includes("redemption limit")) {
    return { code: "LOYALTY_REWARD_LIMIT_REACHED", status: 409, message: "Esta recompensa atingiu o limite de resgates." };
  }
  if (normalized.includes("different reward")) {
    return { code: "LOYALTY_IDEMPOTENCY_CONFLICT", status: 409, message: "Esta tentativa de resgate já foi usada para outra recompensa." };
  }
  if (normalized.includes("does not belong")) {
    return { code: "LOYALTY_CUSTOMER_MISMATCH", status: 403, message: "Este resgate pertence a outro cadastro de cliente." };
  }
  if (normalized.includes("account not found") || normalized.includes("customer not found")) {
    return { code: "LOYALTY_ACCOUNT_NOT_FOUND", status: 409, message: "Você ainda não possui saldo neste programa de fidelidade." };
  }
  if (
    normalized.includes("reward is unavailable") ||
    normalized.includes("program is not active") ||
    normalized.includes("reward not found") ||
    normalized.includes("free product reward is unavailable")
  ) {
    return { code: "LOYALTY_REWARD_UNAVAILABLE", status: 409, message: "Esta recompensa não está disponível para resgate agora." };
  }
  return { code: "LOYALTY_REDEMPTION_FAILED", status: 400, message: "Não foi possível resgatar esta recompensa agora." };
}

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "customer:loyalty:redeem",
    limit: 10,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const idempotencyKey = request.headers.get("idempotency-key")?.trim().toLowerCase() || "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json(
      { code: "INVALID_IDEMPOTENCY_KEY", error: "Inicie uma nova tentativa de resgate." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const rewardId = typeof body?.rewardId === "string" ? body.rewardId.trim() : "";
  if (!UUID_PATTERN.test(rewardId)) {
    return NextResponse.json(
      { code: "INVALID_LOYALTY_REWARD", error: "Selecione uma recompensa válida." },
      { status: 400 },
    );
  }

  const adminSupabase = createAdminClient() as any;
  const context = await resolveCustomerPromotionContext(adminSupabase);
  if (!context) {
    return NextResponse.json(
      { code: "LOYALTY_SESSION_REQUIRED", error: "Confirme seu telefone para resgatar pontos." },
      { status: 401 },
    );
  }

  const { data, error } = await adminSupabase.rpc("redeem_loyalty_reward", {
    p_reward_id: rewardId,
    p_customer_phone: context.phone,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    console.error("Falha ao resgatar recompensa de fidelidade:", error);
    const mapped = redemptionError(error.message);
    return NextResponse.json({ code: mapped.code, error: mapped.message }, { status: mapped.status });
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.redemption_id || !result?.benefit_id) {
    return NextResponse.json(
      { code: "LOYALTY_REDEMPTION_FAILED", error: "Não foi possível concluir o resgate." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    redemption: {
      id: result.redemption_id,
      benefitId: result.benefit_id,
      source: "loyalty",
      restaurantId: result.restaurant_id,
      programId: result.program_id,
      rewardId: result.reward_id,
      type: result.reward_type,
      label: result.reward_label,
      pointsSpent: Number(result.points_spent || 0),
      balanceAfter: Number(result.balance_after || 0),
      expiresAt: result.expires_at || null,
    },
  });
}
