import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import {
  ApiValidationError,
  optionalString,
  readJsonObject,
  requiredString,
  validationErrorResponse,
} from "@/lib/api/validation";

const EVENT_TYPES = new Set([
  "checkout_opened",
  "step_viewed",
  "checkout_abandoned",
  "checkout_error",
  "order_completed",
]);
const STEPS = new Set(["cart", "address", "payment"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REASON_PATTERN = /^[a-z0-9_:-]{1,64}$/i;

export async function POST(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "public:checkout-events",
    limit: 90,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await readJsonObject(request);
    const restaurantId = requiredString(body, "restaurantId", { minLength: 36, maxLength: 36 });
    const sessionId = requiredString(body, "sessionId", { minLength: 36, maxLength: 36 });
    const eventType = requiredString(body, "eventType", { minLength: 1, maxLength: 32 });
    const step = requiredString(body, "step", { minLength: 1, maxLength: 16 });
    const reason = optionalString(body, "reason", { maxLength: 64 }) || null;

    if (
      !UUID_PATTERN.test(restaurantId) ||
      !UUID_PATTERN.test(sessionId) ||
      !EVENT_TYPES.has(eventType) ||
      !STEPS.has(step) ||
      (reason !== null && !SAFE_REASON_PATTERN.test(reason))
    ) {
      throw new ApiValidationError("Evento inválido.", {
        code: "INVALID_CHECKOUT_EVENT",
      });
    }

    const admin = createAdminClient();
    const { error } = await (admin as any).from("storefront_checkout_events").insert({
      restaurant_id: restaurantId,
      session_id: sessionId,
      event_type: eventType,
      step,
      reason,
    });

    if (error) {
      console.error("Checkout analytics insert failed", error);
      return NextResponse.json({ error: "Evento indisponível." }, { status: 503 });
    }

    return NextResponse.json(
      { accepted: true },
      {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Checkout analytics validation failed", error);
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }
}
