import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  acknowledgeIfoodOrderEvents,
  getIfoodOrderDetails,
  IfoodApiError,
  mapIfoodEventCodeToStatus,
  pollIfoodOrderEvents,
  type IfoodOrderEvent,
} from "@/lib/ifood/orders";

type SyncPayload = {
  restaurantId?: string;
};

function roundMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function pickAmount(details: Record<string, unknown>, pathCandidates: string[][]) {
  for (const candidate of pathCandidates) {
    let current: unknown = details;
    for (const segment of candidate) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    const value = roundMoney(current);
    if (value > 0) return value;
  }
  return 0;
}

function getOrderCustomer(details: Record<string, unknown>) {
  const customer =
    (details.customer as Record<string, unknown> | undefined) ||
    (details.orderer as Record<string, unknown> | undefined) ||
    {};

  const name =
    String(customer.name || customer.fullName || details.customerName || "Cliente iFood").trim();
  const phone = String(customer.phone || customer.phoneNumber || details.customerPhone || "").trim();

  return {
    name: name || "Cliente iFood",
    phone: phone || "Não informado",
  };
}

function getOrderAddress(details: Record<string, unknown>) {
  const delivery = (details.delivery as Record<string, unknown> | undefined) || {};
  const address = (delivery.deliveryAddress as Record<string, unknown> | undefined) || {};
  const coordinates = (address.coordinates as Record<string, unknown> | undefined) || {};

  return {
    cep: String(address.postalCode || ""),
    street: String(address.streetName || address.street || ""),
    number: String(address.streetNumber || address.number || ""),
    neighborhood: String(address.neighborhood || ""),
    city: String(address.city || ""),
    state: String(address.state || ""),
    complement: String(address.complement || address.reference || ""),
    reference: String(address.reference || ""),
    latitude: Number(coordinates.latitude || 0) || null,
    longitude: Number(coordinates.longitude || 0) || null,
  };
}

function buildItemAddons(item: Record<string, unknown>) {
  const options = Array.isArray(item.options) ? item.options : [];
  const garnishes = Array.isArray(item.garnishItems) ? item.garnishItems : [];
  const additions = [...options, ...garnishes];

  return additions
    .map((option) => {
      const entry = option as Record<string, unknown>;
      const name = String(entry.name || entry.description || "").trim();
      const quantity = Number(entry.quantity || 1) || 1;
      const price = roundMoney(entry.unitPrice || entry.price?.["value"] || entry.price || 0);

      if (!name) return null;

      return {
        groupId: String(entry.id || entry.groupId || `ifood-${name}`),
        title: name,
        quantity,
        price,
      };
    })
    .filter(Boolean);
}

function buildOrderItems(details: Record<string, unknown>) {
  const items = Array.isArray(details.items) ? details.items : [];

  return items.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const quantity = Number(item.quantity || 1) || 1;
    const unitPrice = roundMoney(
      item.unitPrice ||
        (item.price as Record<string, unknown> | undefined)?.value ||
        item.totalPrice ||
        item.total ||
        0,
    );

    return {
      product_name: String(item.name || item.description || "Item iFood"),
      quantity,
      price: unitPrice,
      observation: String(item.observation || item.notes || "").trim() || null,
      addons: buildItemAddons(item),
    };
  });
}

async function getNextDisplayNumber(admin: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const { data: latestDisplay } = await admin
    .from("orders")
    .select("display_number")
    .eq("restaurant_id", restaurantId)
    .order("display_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Math.max(1, Number(latestDisplay?.display_number || 0) + 1);
}

async function upsertLocalOrderFromIfood(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string,
  event: IfoodOrderEvent,
) {
  const details = await getIfoodOrderDetails(event.orderId);
  if (!details) {
    throw new Error(`Não foi possível obter os detalhes do pedido ${event.orderId} no iFood.`);
  }

  const customer = getOrderCustomer(details);
  const address = getOrderAddress(details);
  const items = buildOrderItems(details);
  const subtotal = pickAmount(details, [
    ["total", "subTotal"],
    ["total", "subTotalAmount"],
    ["totals", "subTotal"],
    ["totals", "itemsPrice"],
  ]);
  const deliveryFee = pickAmount(details, [
    ["total", "deliveryFee"],
    ["total", "deliveryCost"],
    ["totals", "deliveryFee"],
  ]);
  const total = pickAmount(details, [
    ["total", "orderAmount"],
    ["total", "total"],
    ["totals", "total"],
  ]);
  const discount = Math.max(0, roundMoney(subtotal + deliveryFee - total));
  const paymentMethod = String(
    ((details.payments as Record<string, unknown> | undefined)?.methods as Record<string, unknown>[] | undefined)?.[0]?.["method"]
      || ((details.payments as Record<string, unknown> | undefined)?.methods as Record<string, unknown>[] | undefined)?.[0]?.["type"]
      || "ifood",
  ).toLowerCase();
  const displayNumberText = String(details.displayId || "").trim();
  const mappedStatus = mapIfoodEventCodeToStatus(event.code);
  const existingOrderQuery = await admin
    .from("orders")
    .select("id, display_number")
    .eq("restaurant_id", restaurantId)
    .eq("external_order_id", event.orderId)
    .maybeSingle();

  let localOrderId = existingOrderQuery.data?.id || null;

  if (!localOrderId) {
    const nextDisplayNumber = await getNextDisplayNumber(admin, restaurantId);
    const orderId = crypto.randomUUID();

    const { error: insertOrderError } = await admin.from("orders").insert({
      id: orderId,
      restaurant_id: restaurantId,
      customer_name: customer.name,
      customer_phone: customer.phone,
      subtotal,
      delivery_fee: deliveryFee,
      discount,
      total: total || subtotal + deliveryFee - discount,
      status: mappedStatus,
      payment_method: paymentMethod,
      address,
      display_number: nextDisplayNumber,
      external_source: "ifood",
      external_order_id: event.orderId,
      external_display_id: displayNumberText || null,
      is_test: Boolean(details.isTest),
      external_payload: details,
    });

    if (insertOrderError) {
      throw new Error(insertOrderError.message || "Não foi possível criar o pedido iFood.");
    }

    if (items.length > 0) {
      const { error: insertItemsError } = await admin.from("order_items").insert(
        items.map((item) => ({
          order_id: orderId,
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          observation: item.observation,
          addons: item.addons,
        })),
      );

      if (insertItemsError) {
        throw new Error(insertItemsError.message || "Não foi possível gravar os itens do pedido iFood.");
      }
    }

    localOrderId = orderId;
  } else {
    const { error: updateOrderError } = await admin
      .from("orders")
      .update({
        customer_name: customer.name,
        customer_phone: customer.phone,
        subtotal,
        delivery_fee: deliveryFee,
        discount,
        total: total || subtotal + deliveryFee - discount,
        status: mappedStatus,
        payment_method: paymentMethod,
        address,
        external_source: "ifood",
        external_order_id: event.orderId,
        external_display_id: displayNumberText || null,
        is_test: Boolean(details.isTest),
        external_payload: details,
      })
      .eq("id", localOrderId);

    if (updateOrderError) {
      throw new Error(updateOrderError.message || "Não foi possível atualizar o pedido iFood.");
    }
  }

  return {
    localOrderId,
    displayId: displayNumberText || null,
    status: mappedStatus,
    total: total || subtotal + deliveryFee - discount,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncPayload;
    const restaurantId = body.restaurantId?.trim();

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: ownedRestaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, user_id")
      .eq("id", restaurantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (restaurantError || !ownedRestaurant) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: integration, error: integrationError } = await admin
      .from("ifood_integrations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (integrationError || !integration || !integration.merchant_id) {
      return NextResponse.json(
        { error: "Configure o merchant do iFood antes de sincronizar pedidos." },
        { status: 400 },
      );
    }

    const { data: syncRun, error: syncRunError } = await admin
      .from("ifood_sync_runs")
      .insert({
        restaurant_id: restaurantId,
        sync_type: "orders_polling",
        status: "running",
        payload: {
          merchantId: integration.merchant_id,
          source: "manual",
        },
      })
      .select("id")
      .single();

    if (syncRunError || !syncRun) {
      throw new Error("Não foi possível iniciar o log de sincronização do iFood.");
    }

    const polledEvents = await pollIfoodOrderEvents(integration.merchant_id);
    const sortedEvents = [...polledEvents].sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
    );

    const eventIds = sortedEvents.map((event) => event.id);
    const { data: existingEvents } = eventIds.length
      ? await admin
          .from("ifood_order_events")
          .select("ifood_event_id")
          .eq("restaurant_id", restaurantId)
          .in("ifood_event_id", eventIds)
      : { data: [] as { ifood_event_id: string }[] };

    const existingEventIds = new Set((existingEvents || []).map((event) => event.ifood_event_id));

    const eventsToInsert = sortedEvents
      .filter((event) => !existingEventIds.has(event.id))
      .map((event) => ({
        restaurant_id: restaurantId,
        ifood_event_id: event.id,
        ifood_order_id: event.orderId,
        merchant_id: event.merchantId,
        event_code: event.code,
        event_full_code: event.fullCode || null,
        event_group: String((event.metadata as Record<string, unknown> | undefined)?.group || "ORDER_STATUS"),
        event_created_at: event.createdAt || null,
        raw_payload: event,
      }));

    if (eventsToInsert.length > 0) {
      const { error: insertEventsError } = await admin.from("ifood_order_events").insert(eventsToInsert);
      if (insertEventsError) {
        throw new Error(insertEventsError.message || "Não foi possível armazenar os eventos do iFood.");
      }
    }

    let processedCount = 0;
    const touchedOrders: string[] = [];

    for (const event of sortedEvents) {
      try {
        const result = await upsertLocalOrderFromIfood(admin, restaurantId, event);
        processedCount += 1;
        touchedOrders.push(event.orderId);

        await admin
          .from("ifood_order_events")
          .update({
            local_order_id: result.localOrderId,
            processed_at: new Date().toISOString(),
          })
          .eq("restaurant_id", restaurantId)
          .eq("ifood_event_id", event.id);
      } catch (eventError) {
        console.error(`Erro ao processar evento ${event.id} do iFood:`, eventError);
      }
    }

    if (eventIds.length > 0) {
      await acknowledgeIfoodOrderEvents(eventIds);
      await admin
        .from("ifood_order_events")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId)
        .in("ifood_event_id", eventIds);
    }

    await admin
      .from("ifood_integrations")
      .update({
        last_order_sync_at: new Date().toISOString(),
        status: integration.status === "disconnected" ? "configuring" : integration.status,
      })
      .eq("restaurant_id", restaurantId);

    await admin
      .from("ifood_sync_runs")
      .update({
        status: "success",
        events_received: sortedEvents.length,
        events_processed: processedCount,
        events_acknowledged: eventIds.length,
        summary:
          sortedEvents.length > 0
            ? `${processedCount} evento(s) processado(s) e ${eventIds.length} ACK enviado(s).`
            : "Nenhum evento novo encontrado no polling do iFood.",
        payload: {
          merchantId: integration.merchant_id,
          touchedOrders,
        },
      })
      .eq("id", syncRun.id);

    return NextResponse.json({
      ok: true,
      summary: {
        eventsReceived: sortedEvents.length,
        eventsProcessed: processedCount,
        eventsAcknowledged: eventIds.length,
        touchedOrders: Array.from(new Set(touchedOrders)),
      },
    });
  } catch (error) {
    console.error("Erro ao sincronizar pedidos do iFood:", error);

    if (error instanceof IfoodApiError && error.status === 400) {
      return NextResponse.json(
        {
          error:
            "O iFood rejeitou o polling de pedidos com Bad Request. Isso normalmente acontece quando o app ainda não tem liberação efetiva para Order/Events, quando a loja de teste não está pronta para esse módulo, ou quando o merchant usado não é aceito nesse endpoint.",
          details: error.responseBody,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar os pedidos do iFood.",
      },
      { status: 500 },
    );
  }
}
