import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeCustomerPhone } from "@/lib/customer-account";
import { sanitizeCustomerReturnUrl } from "@/lib/customer-auth-routing";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type OtpRoutePayload = {
  phone?: string;
  returnUrl?: string;
};

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function hasTrustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const requestHost = forwardedHost || request.headers.get("host")?.trim() || "";
  if (!requestHost || originUrl.host.toLowerCase() !== requestHost.toLowerCase()) return false;

  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  if (forwardedProto && originUrl.protocol.replace(":", "").toLowerCase() !== forwardedProto) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  return !fetchSite || fetchSite === "same-origin";
}

function getStorefrontSlug(returnUrl: string) {
  const safeReturnUrl = sanitizeCustomerReturnUrl(returnUrl, "");
  if (!safeReturnUrl || !safeReturnUrl.startsWith("/")) return null;

  const pathname = safeReturnUrl.split(/[?#]/, 1)[0] || "";
  const firstSegment = pathname.split("/").filter(Boolean)[0]?.trim() || "";
  if (!firstSegment || firstSegment.length > 120) return null;

  return decodeURIComponent(firstSegment);
}

function jsonError(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { status });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(
      "INVALID_REQUEST_ORIGIN",
      "Não foi possível validar a origem da solicitação do código.",
      403,
    );
  }

  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "customer:phone:otp-route",
    limit: 8,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  let body: OtpRoutePayload;
  try {
    body = (await request.json()) as OtpRoutePayload;
  } catch {
    return jsonError("INVALID_OTP_ROUTE", "Solicitação de código inválida.", 400);
  }

  const phone = normalizeCustomerPhone(body.phone || "");
  const storefrontSlug = getStorefrontSlug(body.returnUrl || "");
  if (!phone || !storefrontSlug) {
    return jsonError(
      "STORE_CONTEXT_REQUIRED",
      "Abra a confirmação de telefone a partir da loja para receber o código pelo WhatsApp do restaurante.",
      400,
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    return jsonError("CUSTOMER_LOGIN_REQUIRED", "Entre na sua conta para solicitar o código.", 401);
  }

  const adminSupabase = createAdminClient() as any;
  const { data: restaurant, error: restaurantError } = await adminSupabase
    .from("restaurants")
    .select("id, name, slug")
    .eq("slug", storefrontSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (restaurantError || !restaurant?.id) {
    return jsonError(
      "STORE_CONTEXT_REQUIRED",
      "Não foi possível identificar a loja que deve enviar o código pelo WhatsApp.",
      400,
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();

  try {
    await adminSupabase
      .from("customer_phone_otp_routes")
      .delete()
      .eq("requester_user_id", user.id)
      .eq("phone", phone)
      .is("consumed_at", null);

    const { error: insertError } = await adminSupabase
      .from("customer_phone_otp_routes")
      .insert({
        requester_user_id: user.id,
        phone,
        restaurant_id: restaurant.id,
        expires_at: expiresAt,
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      restaurant: {
        slug: restaurant.slug,
        name: restaurant.name,
      },
    });
  } catch (error) {
    console.error("Falha ao registrar contexto de envio do OTP por restaurante:", error);
    return jsonError(
      "OTP_ROUTE_UNAVAILABLE",
      "Não foi possível preparar o envio do código pelo WhatsApp da loja.",
      503,
    );
  }
}
