import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { getCheckoutAddressErrors } from "@/features/storefront/checkout-format";
import {
  calculateDeliveryQuote,
  DeliveryQuoteError,
  type DeliveryQuoteAddress,
} from "@/lib/delivery-quote";

type DeliveryQuotePayload = {
  restaurantId?: string;
  address?: DeliveryQuoteAddress;
  subtotal?: number;
};

function normalizeAddress(address: DeliveryQuoteAddress = {}) {
  return {
    cep: address.cep?.trim() || "",
    street: address.street?.trim() || "",
    number: address.number?.trim() || "",
    neighborhood: address.neighborhood?.trim() || "",
    city: address.city?.trim() || "",
    state: address.state?.trim().toUpperCase() || "",
  };
}

function getSubtotalFromCookie(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("gestor_cart_subtotal="));
  if (!entry) return null;

  const parsed = Number(decodeURIComponent(entry.slice("gestor_cart_subtotal=".length)));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(request: Request) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "public:delivery-quote",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as DeliveryQuotePayload;
    const address = normalizeAddress(body.address);

    if (!body.restaurantId) {
      return NextResponse.json({ code: "INVALID_STORE", error: "Loja inválida." }, { status: 400 });
    }

    const addressErrors = getCheckoutAddressErrors(address);
    const invalidFields = Object.entries(addressErrors)
      .filter(([, message]) => Boolean(message))
      .map(([field]) => field);

    if (invalidFields.length > 0) {
      return NextResponse.json(
        {
          code: "INCOMPLETE_ADDRESS",
          error: "Complete e confira o endereço de entrega.",
          fields: invalidFields,
        },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const { data: restaurant, error } = await (adminSupabase as any)
      .from("restaurants")
      .select(
        "id, latitude, longitude, address_zip, address_street, address_number, address_neighborhood, address_city, address_state, delivery_tiers, delivery_rules",
      )
      .eq("id", body.restaurantId)
      .maybeSingle();

    if (error || !restaurant) {
      return NextResponse.json({ code: "STORE_NOT_FOUND", error: "Loja não encontrada." }, { status: 404 });
    }

    const bodySubtotal = Number(body.subtotal);
    const subtotal = Number.isFinite(bodySubtotal) && bodySubtotal >= 0
      ? bodySubtotal
      : getSubtotalFromCookie(request);

    const quote = await calculateDeliveryQuote(restaurant, address, { subtotal });
    return NextResponse.json(quote, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DeliveryQuoteError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.message,
          ...(error.details || {}),
        },
        { status: error.status },
      );
    }

    console.error("Erro ao calcular cotação de entrega:", error);
    return NextResponse.json(
      { code: "DELIVERY_CALCULATION_UNAVAILABLE", error: "Não foi possível calcular a entrega agora." },
      { status: 500 },
    );
  }
}
