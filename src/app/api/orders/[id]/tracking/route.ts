import { NextResponse } from "next/server";
import { normalizePublicOrderStatus } from "@/features/storefront/order-tracking";
import { calculateDeliveryFee } from "@/lib/geo";
import { verifyOrderTrackingToken } from "@/lib/order-tracking";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import {
  readJsonObject,
  requiredString,
  validationErrorResponse,
} from "@/lib/api/validation";

type Params = { params: Promise<{ id: string }> };
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAddress(value: unknown) {
  const address = isRecord(value) ? value : {};
  return {
    cep: String(address.cep || ""),
    street: String(address.street || ""),
    number: String(address.number || ""),
    neighborhood: String(address.neighborhood || ""),
    city: String(address.city || ""),
    state: String(address.state || ""),
    complement: String(address.complement || ""),
  };
}

function normalizeAddons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((addon) => ({ name: String(addon.name || ""), price: Number(addon.price) || 0 }))
    .filter((addon) => addon.name);
}

async function loadTrackingResponse(id: string) {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, restaurant_id, display_number, customer_name, customer_phone, address, subtotal, delivery_fee, discount, total, status, payment_method, change_for, scheduled_for, cancellation_reason, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !order) return null;

  const [
    { data: items, error: itemsError },
    { data: restaurant, error: restaurantError },
    { data: history, error: historyError },
  ] = await Promise.all([
    admin
      .from("order_items")
      .select("product_name, quantity, price, observation, addons")
      .eq("order_id", order.id),
    admin
      .from("restaurants")
      .select("name, slug, phone, whatsapp_number, primary_color, delivery_tiers")
      .eq("id", order.restaurant_id)
      .maybeSingle(),
    admin
      .from("order_status_history")
      .select("status, changed_at")
      .eq("order_id", order.id)
      .order("changed_at", { ascending: true }),
  ]);

  if (itemsError || restaurantError || historyError || !restaurant) return null;

  const rawAddress = isRecord(order.address) ? order.address : {};
  const distance = Number(rawAddress.distance);
  const tiers = Array.isArray(restaurant.delivery_tiers) ? restaurant.delivery_tiers : [];
  const deliveryTime = Number.isFinite(distance)
    ? calculateDeliveryFee(distance, tiers).time
    : 0;

  return {
    orderId: order.id,
    displayNumber: order.display_number
      ? String(order.display_number).padStart(4, "0")
      : order.id.slice(0, 4).toUpperCase(),
    status: normalizePublicOrderStatus(order.status),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    statusHistory: (history || []).map((entry) => ({
      status: normalizePublicOrderStatus(entry.status),
      changedAt: entry.changed_at,
    })),
    cancellationReason: order.cancellation_reason || null,
    scheduledFor: order.scheduled_for,
    deliveryTime,
    customerName: order.customer_name,
    address: normalizeAddress(order.address),
    subtotal: Number(order.subtotal) || 0,
    deliveryFee: Number(order.delivery_fee) || 0,
    discount: Number(order.discount) || 0,
    total: Number(order.total) || 0,
    paymentMethod: order.payment_method,
    changeFor: order.change_for,
    items: (items || []).map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      price: Number(item.price) || 0,
      observation: item.observation,
      addons: normalizeAddons(item.addons),
    })),
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      phone: restaurant.phone || restaurant.whatsapp_number || "",
      primaryColor: restaurant.primary_color || "#ff5a1f",
    },
    customerPhone: order.customer_phone,
  };
}

function publicResponse(data: NonNullable<Awaited<ReturnType<typeof loadTrackingResponse>>>) {
  const { customerPhone, ...safeData } = data;
  void customerPhone;
  return NextResponse.json(safeData, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: Request, context: Params) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "order-tracking:token",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await context.params;
    const token = new URL(request.url).searchParams.get("token") || "";
    if (!verifyOrderTrackingToken(id, token)) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    const data = await loadTrackingResponse(id);
    if (!data) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    return publicResponse(data);
  } catch (error) {
    console.error("Erro ao acompanhar pedido:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o pedido agora." },
      { status: 500 },
    );
  }
}

// Compatibilidade com confirmações criadas antes do link seguro.
export async function POST(request: Request, context: Params) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "order-tracking:phone",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await readJsonObject(request);
    const phone = requiredString(body, "phone", { minLength: 10, maxLength: 24 });
    const phoneDigits = phone.replace(/\D/g, "");
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      return NextResponse.json(
        { code: "INVALID_PHONE", error: "Telefone inválido." },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const data = await loadTrackingResponse(id);
    const savedPhone = String(data?.customerPhone || "").replace(/\D/g, "");
    if (!data || savedPhone !== phoneDigits) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    return publicResponse(data);
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    console.error("Erro ao acompanhar pedido:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o pedido agora." },
      { status: 500 },
    );
  }
}
