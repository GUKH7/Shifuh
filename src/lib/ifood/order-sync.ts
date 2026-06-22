import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  acknowledgeIfoodOrderEvents,
  getIfoodOrderDetails,
  mapIfoodEventCodeToStatus,
  pollIfoodOrderEvents,
  type IfoodOrderEvent,
} from "@/lib/ifood/orders";

type AdminClient = ReturnType<typeof createAdminClient>;

type SyncIfoodOrdersParams = {
  restaurantId: string;
  merchantId: string;
  source: "manual" | "cron";
};

type LocalOrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

type ExistingIfoodEventState = {
  ifood_event_id: string;
  processed_at: string | null;
  acknowledged_at: string | null;
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

function pickText(details: Record<string, unknown>, pathCandidates: string[][]) {
  for (const candidate of pathCandidates) {
    let current: unknown = details;
    for (const segment of candidate) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (typeof current === "string" && current.trim()) return current.trim();
  }

  return null;
}

function getOrderCustomer(details: Record<string, unknown>) {
  const customer =
    (details.customer as Record<string, unknown> | undefined) ||
    (details.orderer as Record<string, unknown> | undefined) ||
    {};
  const phone =
    customer.phone && typeof customer.phone === "object"
      ? (customer.phone as Record<string, unknown>)
      : null;

  const name =
    String(customer.name || customer.fullName || details.customerName || "Cliente iFood").trim();
  const phoneNumber = String(
    phone?.number || customer.phoneNumber || customer.phone || details.customerPhone || "",
  ).trim();

  return {
    name: name || "Cliente iFood",
    phone: phoneNumber || "Não informado",
  };
}

function getOrderAddress(details: Record<string, unknown>) {
  const delivery = (details.delivery as Record<string, unknown> | undefined) || {};
  const address = (delivery.deliveryAddress as Record<string, unknown> | undefined) || {};
  const takeout = (details.takeout as Record<string, unknown> | undefined) || {};
  const indoor = (details.indoor as Record<string, unknown> | undefined) || {};
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
    orderType: String(details.orderType || delivery.mode || ""),
    takeoutMode: String(takeout.mode || indoor.mode || ""),
    indoorTable: String(indoor.table || ""),
    indoorObservations: String(indoor.observations || ""),
  };
}

function buildItemAddons(item: Record<string, unknown>) {
  const options = Array.isArray(item.options) ? item.options : [];
  const customizations = options.flatMap((option) => {
    const entry = option as Record<string, unknown>;
    return Array.isArray(entry.customization) ? entry.customization : [];
  });
  const garnishes = Array.isArray(item.garnishItems) ? item.garnishItems : [];
  const additions = [...options, ...customizations, ...garnishes];

  return additions
    .map((option) => {
      const entry = option as Record<string, unknown>;
      const name = String(entry.name || entry.description || "").trim();
      const quantity = Number(entry.quantity || 1) || 1;
      const priceValue =
        entry.price && typeof entry.price === "object"
          ? (entry.price as Record<string, unknown>).value
          : entry.price;
      const price = roundMoney(entry.unitPrice || priceValue || entry.price || 0);

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
      observation: String(item.observations || item.observation || item.notes || "").trim() || null,
      addons: buildItemAddons(item),
    };
  });
}

function buildPaymentSummary(details: Record<string, unknown>) {
  const payments = (details.payments as Record<string, unknown> | undefined) || {};
  const methods = Array.isArray(payments.methods)
    ? (payments.methods as Record<string, unknown>[])
    : [];
  const firstMethod = methods[0] || {};
  const cash = (firstMethod.cash as Record<string, unknown> | undefined) || {};
  const card = (firstMethod.card as Record<string, unknown> | undefined) || {};

  return {
    prepaid: roundMoney(payments.prepaid || 0),
    pending: roundMoney(payments.pending || 0),
    methods,
    firstMethod: String(firstMethod.method || firstMethod.type || "ifood").toLowerCase(),
    methodType: String(firstMethod.type || ""),
    methodName: String(firstMethod.method || ""),
    cardBrand: String(card.brand || ""),
    changeFor: cash.changeFor ? roundMoney(cash.changeFor) : null,
  };
}

function buildBenefitsSummary(details: Record<string, unknown>) {
  const benefits = (details.benefits as Record<string, unknown> | undefined) || {};
  const items = Array.isArray(benefits.items) ? benefits.items : [];

  return {
    items,
    totalValue: roundMoney((details.total as Record<string, unknown> | undefined)?.benefits || 0),
  };
}

function buildScheduleSummary(details: Record<string, unknown>) {
  const schedule = (details.schedule as Record<string, unknown> | undefined) || {};
  return {
    deliveryDateTimeStart: schedule.deliveryDateTimeStart || null,
    deliveryDateTimeEnd: schedule.deliveryDateTimeEnd || null,
  };
}

function buildIfoodOrderMetadata(details: Record<string, unknown>) {
  const payment = buildPaymentSummary(details);
  const benefits = buildBenefitsSummary(details);
  const schedule = buildScheduleSummary(details);

  return {
    orderId: String(details.id || ""),
    displayId: String(details.displayId || ""),
    orderType: String(details.orderType || ""),
    orderTiming: String(details.orderTiming || ""),
    salesChannel: String(details.salesChannel || ""),
    preparationStartDateTime:
      pickText(details, [["preparationStartDateTime"], ["preparation", "startDateTime"]]) || null,
    schedule,
    payment,
    benefits,
    customerDocument: pickText(details, [["customer", "documentNumber"], ["customer", "document"]]),
    observations:
      pickText(details, [["observations"], ["delivery", "observations"], ["takeout", "observations"]]) ||
      null,
  };
}

function buildEventMetadata(event: IfoodOrderEvent) {
  return {
    id: event.id,
    code: event.code,
    fullCode: event.fullCode || event.code,
    group: String((event.metadata as Record<string, unknown> | undefined)?.group || "ORDER_STATUS"),
    createdAt: event.createdAt || null,
    metadata: event.metadata || null,
  };
}

function buildCancellationMetadata(event: IfoodOrderEvent) {
  const code = String(event.code || "").toUpperCase();
  const fullCode = String(event.fullCode || "").toUpperCase();
  const metadata = (event.metadata as Record<string, unknown> | undefined) || {};
  const isRequested = code === "CAR" || fullCode === "CANCELLATION_REQUESTED";
  const isFailed = code === "CARF" || fullCode === "CANCELLATION_REQUEST_FAILED";
  const isConsumerRequested = code === "CCR" || fullCode === "CONSUMER_CANCELLATION_REQUESTED";
  const isConsumerAccepted = code === "CCA" || fullCode === "CONSUMER_CANCELLATION_ACCEPTED";
  const isConsumerDenied = code === "CCD" || fullCode === "CONSUMER_CANCELLATION_DENIED";
  const isCanceled = code === "CAN" || fullCode === "CANCELLED";

  if (!isRequested && !isFailed && !isConsumerRequested && !isConsumerAccepted && !isConsumerDenied && !isCanceled) {
    return null;
  }

  const reason =
    metadata.reasonDescription ||
    metadata.reason ||
    metadata.details ||
    metadata.attemptedReason ||
    null;

  return {
    status: isCanceled
      ? "approved"
      : isFailed || isConsumerDenied
        ? "failed"
        : isRequested || isConsumerRequested
          ? "requested"
          : "accepted",
    reason: reason ? String(reason) : null,
    eventCode: event.code,
    eventFullCode: event.fullCode || event.code,
    eventCreatedAt: event.createdAt || null,
    metadata,
  };
}

async function getNextDisplayNumber(admin: AdminClient, restaurantId: string) {
  const { data, error } = await admin.rpc("next_order_display_number", {
    p_restaurant_id: restaurantId,
  });

  if (error || !data) {
    throw new Error(error?.message || "Não foi possível gerar o número do pedido iFood.");
  }

  return data;
}

async function upsertLocalOrderFromIfood(
  admin: AdminClient,
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
  const metadata = buildIfoodOrderMetadata(details);
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
  const discount =
    pickAmount(details, [
      ["total", "benefits"],
      ["total", "discount"],
      ["totals", "benefits"],
      ["totals", "discount"],
    ]) || Math.max(0, roundMoney(subtotal + deliveryFee - total));
  const paymentMethod = String(
    ((details.payments as Record<string, unknown> | undefined)?.methods as
      | Record<string, unknown>[]
      | undefined)?.[0]?.["method"] ||
      ((details.payments as Record<string, unknown> | undefined)?.methods as
        | Record<string, unknown>[]
        | undefined)?.[0]?.["type"] ||
      "ifood",
  ).toLowerCase();
  const displayNumberText = String(details.displayId || "").trim();
  const mappedStatus =
    mapIfoodEventCodeToStatus(event.code) ||
    (event.fullCode ? mapIfoodEventCodeToStatus(event.fullCode) : null);
  const lastIfoodEvent = buildEventMetadata(event);
  const cancellation = buildCancellationMetadata(event);
  const existingOrderQuery = await admin
    .from("orders")
    .select("id, display_number, status, external_payload")
    .eq("restaurant_id", restaurantId)
    .eq("external_order_id", event.orderId)
    .maybeSingle();

  let localOrderId = existingOrderQuery.data?.id || null;
  const existingStatus = (existingOrderQuery.data?.status as LocalOrderStatus | null) || null;
  const nextStatus: LocalOrderStatus = mappedStatus || existingStatus || "pending";
  const existingPayload =
    existingOrderQuery.data?.external_payload && typeof existingOrderQuery.data.external_payload === "object"
      ? (existingOrderQuery.data.external_payload as Record<string, unknown>)
      : {};
  const existingGestorDelivery =
    existingPayload.gestorDelivery && typeof existingPayload.gestorDelivery === "object"
      ? (existingPayload.gestorDelivery as Record<string, unknown>)
      : {};
  const gestorDelivery = {
    ...existingGestorDelivery,
    ...metadata,
    lastIfoodEvent,
    ...(cancellation ? { cancellation } : {}),
  };

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
      status: nextStatus,
      payment_method: paymentMethod,
      change_for: metadata.payment.changeFor ? String(metadata.payment.changeFor) : null,
      address,
      display_number: nextDisplayNumber,
      external_source: "ifood",
      external_order_id: event.orderId,
      external_display_id: displayNumberText || null,
      is_test: Boolean(details.isTest),
      external_payload: {
        ...(details as Json as Record<string, unknown>),
        gestorDelivery,
      } as Json,
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
        status: nextStatus,
        payment_method: paymentMethod,
        change_for: metadata.payment.changeFor ? String(metadata.payment.changeFor) : null,
        address,
        external_source: "ifood",
        external_order_id: event.orderId,
        external_display_id: displayNumberText || null,
        is_test: Boolean(details.isTest),
        external_payload: {
          ...existingPayload,
          ...(details as Json as Record<string, unknown>),
          gestorDelivery,
        } as Json,
      })
      .eq("id", localOrderId);

    if (updateOrderError) {
      throw new Error(updateOrderError.message || "Não foi possível atualizar o pedido iFood.");
    }
  }

  return {
    localOrderId,
    displayId: displayNumberText || null,
    status: nextStatus,
    total: total || subtotal + deliveryFee - discount,
  };
}

export async function syncIfoodOrdersForRestaurant({
  restaurantId,
  merchantId,
  source,
}: SyncIfoodOrdersParams) {
  const admin = createAdminClient();
  const { data: syncRun, error: syncRunError } = await admin
    .from("ifood_sync_runs")
    .insert({
      restaurant_id: restaurantId,
      sync_type: "orders_polling",
      status: "running",
      payload: {
        merchantId,
        source,
      },
    })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    throw new Error("Não foi possível iniciar o log de sincronização do iFood.");
  }

  try {
    const polledEvents = await pollIfoodOrderEvents(merchantId);
    const sortedEvents = [...polledEvents].sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
    );

    const eventIds = Array.from(new Set(sortedEvents.map((event) => event.id)));
    const { data: existingEvents } = eventIds.length
      ? await admin
          .from("ifood_order_events")
          .select("ifood_event_id, processed_at, acknowledged_at")
          .eq("restaurant_id", restaurantId)
          .in("ifood_event_id", eventIds)
      : { data: [] as ExistingIfoodEventState[] };

    const existingEventById = new Map(
      (existingEvents || []).map((event) => [event.ifood_event_id, event]),
    );
    const newEvents = sortedEvents.filter((event) => !existingEventById.has(event.id));

    const eventsToInsert = newEvents.map((event) => ({
      restaurant_id: restaurantId,
      ifood_event_id: event.id,
      ifood_order_id: event.orderId,
      merchant_id: event.merchantId,
      event_code: event.code,
      event_full_code: event.fullCode || null,
      event_group: String((event.metadata as Record<string, unknown> | undefined)?.group || "ORDER_STATUS"),
      event_created_at: event.createdAt || null,
      raw_payload: event as unknown as Json,
    }));

    if (eventsToInsert.length > 0) {
      const { error: insertEventsError } = await admin.from("ifood_order_events").insert(eventsToInsert);
      if (insertEventsError) {
        throw new Error(insertEventsError.message || "Não foi possível armazenar os eventos do iFood.");
      }
    }

    let processedCount = 0;
    let failedCount = 0;
    const touchedOrders: string[] = [];
    const processedEventIds = new Set<string>();
    const alreadyProcessedEventIds = new Set(
      sortedEvents
        .filter((event) => existingEventById.get(event.id)?.processed_at)
        .map((event) => event.id),
    );
    const eventsToProcess = sortedEvents.filter((event) => {
      const existingEvent = existingEventById.get(event.id);
      return !existingEvent || !existingEvent.processed_at;
    });

    for (const event of eventsToProcess) {
      try {
        const result = await upsertLocalOrderFromIfood(admin, restaurantId, event);
        processedCount += 1;
        touchedOrders.push(event.orderId);
        processedEventIds.add(event.id);

        await admin
          .from("ifood_order_events")
          .update({
            local_order_id: result.localOrderId,
            processed_at: new Date().toISOString(),
          })
          .eq("restaurant_id", restaurantId)
          .eq("ifood_event_id", event.id);
      } catch (eventError) {
        failedCount += 1;
        console.error(`Erro ao processar evento ${event.id} do iFood:`, eventError);
      }
    }

    const ackEventIds = Array.from(
      new Set([...processedEventIds, ...alreadyProcessedEventIds]),
    );
    let acknowledgedCount = 0;

    if (ackEventIds.length > 0) {
      await acknowledgeIfoodOrderEvents(ackEventIds);
      acknowledgedCount = ackEventIds.length;
      await admin
        .from("ifood_order_events")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId)
        .in("ifood_event_id", ackEventIds);
    }

    await admin
      .from("ifood_integrations")
      .update({
        last_order_sync_at: new Date().toISOString(),
      })
      .eq("restaurant_id", restaurantId);

    const summary =
      sortedEvents.length > 0
        ? `${processedCount} evento(s) processado(s), ${alreadyProcessedEventIds.size} duplicado(s) ja processado(s), ${failedCount} falha(s) pendente(s) e ${acknowledgedCount} ACK enviado(s).`
        : "Nenhum evento novo encontrado no polling do iFood.";

    await admin
      .from("ifood_sync_runs")
      .update({
        status: failedCount > 0 ? "partial_success" : "success",
        events_received: sortedEvents.length,
        events_processed: processedCount,
        events_acknowledged: acknowledgedCount,
        summary,
        payload: {
          merchantId,
          source,
          touchedOrders,
          duplicateEvents: sortedEvents.length - newEvents.length,
          pendingEvents: failedCount,
          ackEventIds,
        },
      })
      .eq("id", syncRun.id);

    return {
      eventsReceived: sortedEvents.length,
      eventsProcessed: processedCount,
      eventsAcknowledged: acknowledgedCount,
      duplicateEvents: sortedEvents.length - newEvents.length,
      pendingEvents: failedCount,
      touchedOrders: Array.from(new Set(touchedOrders)),
    };
  } catch (error) {
    await admin
      .from("ifood_sync_runs")
      .update({
        status: "error",
        summary: error instanceof Error ? error.message : "Falha ao sincronizar pedidos do iFood.",
        payload: {
          merchantId,
          source,
        },
      })
      .eq("id", syncRun.id);

    throw error;
  }
}
