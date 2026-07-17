import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "order-tracking",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { phone } = (await request.json()) as { phone?: string };
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      return NextResponse.json({ error: "Telefone inválido." }, { status: 400 });
    }

    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: order, error } = await admin
      .from("orders")
      .select("id, display_number, customer_phone, status, created_at")
      .eq("id", id)
      .maybeSingle();

    const savedPhone = String(order?.customer_phone || "").replace(/\D/g, "");
    if (error || !order || savedPhone !== phoneDigits) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      displayNumber: order.display_number
        ? String(order.display_number).padStart(4, "0")
        : order.id.slice(0, 4).toUpperCase(),
      status: order.status,
      createdAt: order.created_at,
    });
  } catch (error) {
    console.error("Erro ao acompanhar pedido:", error);
    return NextResponse.json({ error: "Não foi possível consultar o pedido." }, { status: 500 });
  }
}
