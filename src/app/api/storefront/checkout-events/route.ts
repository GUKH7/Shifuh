import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

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

type CheckoutEventPayload = {
  restaurantId?: string;
  sessionId?: string;
  eventType?: string;
  step?: string;
  reason?: string;
};

export async function POST(request: Request) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "public:checkout-events",
    limit: 90,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = JSON.parse(await request.text()) as CheckoutEventPayload;
    const reason = body.reason?.trim() || null;

    if (
      !body.restaurantId ||
      !UUID_PATTERN.test(body.restaurantId) ||
      !body.sessionId ||
      !UUID_PATTERN.test(body.sessionId) ||
      !body.eventType ||
      !EVENT_TYPES.has(body.eventType) ||
      !body.step ||
      !STEPS.has(body.step) ||
      (reason !== null && !SAFE_REASON_PATTERN.test(reason))
    ) {
      return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await (admin as any).from("storefront_checkout_events").insert({
      restaurant_id: body.restaurantId,
      session_id: body.sessionId,
      event_type: body.eventType,
      step: body.step,
      reason,
    });

    if (error) {
      console.error("Checkout analytics insert failed", error);
      return NextResponse.json({ error: "Evento indisponível." }, { status: 503 });
    }

    return NextResponse.json({ accepted: true }, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }
}
