import { NextResponse } from "next/server";
import { normalizeStorefrontPaymentMethods } from "@/features/storefront/checkout-format";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "public:storefront:payment-methods",
    limit: 60,
    windowMs: 60_000,
  });

  if (rateLimitResponse) return rateLimitResponse;

  const slug = new URL(request.url).searchParams.get("slug")?.trim() || "";
  if (!slug) {
    return NextResponse.json(
      { code: "MISSING_STORE_SLUG", error: "Loja não informada." },
      { status: 400 },
    );
  }

  const adminSupabase = createAdminClient();
  const { data: restaurant, error } = await (adminSupabase as any)
    .from("restaurants")
    .select("accepted_payment_methods")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !restaurant) {
    return NextResponse.json(
      { code: "STORE_NOT_FOUND", error: "Loja não encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    paymentMethods: normalizeStorefrontPaymentMethods(restaurant.accepted_payment_methods),
  });
}
