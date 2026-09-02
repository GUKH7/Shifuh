import { NextResponse } from "next/server";
import { calculateDeliveryQuote, DeliveryQuoteError } from "@/lib/delivery-quote";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getStoreStatus } from "@/features/storefront/store-summary";
import { createOrderTrackingToken } from "@/lib/order-tracking";
import { CUSTOMER_SESSION_COOKIE, ensureCustomerAccount } from "@/lib/customer-account";
import { resolveCustomerPromotionContext } from "@/lib/promotions/customer-context";
import {
  getCheckoutAddressErrors,
  getChangeForError,
  isStorefrontPaymentMethod,
  normalizeStorefrontPaymentMethods,
  parseCurrencyInput,
} from "@/features/storefront/checkout-format";

type CheckoutAddress = {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  complement?: string;
};

type CheckoutAddon = {
  groupId?: string;
  name: string;
};

type NormalizedAddon = {
  groupId?: string;
  groupName?: string;
  name: string;
  price: number;
};

type CheckoutItem = {
  productId: string;
  quantity: number;
  selectedAddons?: CheckoutAddon[];
  observation?: string;
};

type CheckoutPayload = {
  restaurantId?: string;
  customerName?: string;
  customerPhone?: string;
  address?: CheckoutAddress;
  paymentMethod?: string;
  changeFor?: string;
  couponCode?: string;
  rewardId?: string | null;
  cart?: CheckoutItem[];
  usingSavedAddress?: boolean;
  saveAddress?: boolean;
  scheduledFor?: string | null;
  fulfillmentType?: "delivery" | "pickup";
};

type CheckoutReward = {
  id: string;
  customer_id: string;
  reward_type: "percent" | "fixed" | "free_shipping" | "free_product";
  label: string;
  percentage_value: number | null;
  fixed_amount: number | null;
  product_id: string | null;
  minimum_order_amount: number | null;
  status: "available" | "redeemed" | "expired" | "cancelled";
  expires_at: string | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAddress(address: CheckoutAddress = {}) {
  return {
    cep: address.cep?.trim() || "",
    street: address.street?.trim() || "",
    number: address.number?.trim() || "",
    neighborhood: address.neighborhood?.trim() || "",
    city: address.city?.trim() || "",
    state: address.state?.trim().toUpperCase() || "",
    complement: address.complement?.trim() || "",
  };
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveAddonSelection(selectedAddons: CheckoutAddon[], productAddons: unknown) {
  if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) {
    return {
      normalized: [] as NormalizedAddon[],
      addonTotal: 0,
    };
  }

  const groups = Array.isArray(productAddons) ? productAddons : [];
  const normalized: NormalizedAddon[] = [];
  let addonTotal = 0;

  for (const selected of selectedAddons) {
    if (!selected?.name) continue;

    let matchedGroup: Record<string, unknown> | undefined;
    let matchedOption: Record<string, unknown> | undefined;

    if (selected.groupId) {
      matchedGroup = groups.find(
        (item) => isRecord(item) && String(item.id ?? "") === selected.groupId,
      ) as Record<string, unknown> | undefined;
      const options = Array.isArray(matchedGroup?.options) ? matchedGroup.options : [];
      matchedOption = options.find(
        (option) => isRecord(option) && String(option.name ?? "") === selected.name,
      ) as Record<string, unknown> | undefined;
    } else {
      for (const group of groups) {
        if (!isRecord(group)) continue;
        const options = Array.isArray(group.options) ? group.options : [];
        const option = options.find(
          (candidate) => isRecord(candidate) && String(candidate.name ?? "") === selected.name,
        ) as Record<string, unknown> | undefined;
        if (option) {
          matchedGroup = group;
          matchedOption = option;
          break;
        }
      }
    }

    if (!matchedOption) {
      throw new Error(`Complemento inválido: ${selected.name}`);
    }

    const optionPrice = parseNumber(matchedOption.price);
    const resolvedGroupId = selected.groupId || String(matchedGroup?.id ?? "").trim() || undefined;
    const groupName = String(matchedGroup?.title ?? matchedGroup?.name ?? "").trim() || undefined;
    addonTotal += optionPrice;
    normalized.push({
      groupId: resolvedGroupId,
      groupName,
      name: selected.name,
      price: optionPrice,
    });
  }

  return {
    normalized,
    addonTotal: roundMoney(addonTotal),
  };
}

function hasCurrentUser(user: { id: string } | null) {
  return Boolean(user?.id);
}

type CreatedOrderRow = {
  order_id: string;
  display_number: number;
  reward_discount?: number | null;
  order_total?: number | null;
  reward_id?: string | null;
  reward_type?: string | null;
  reward_label?: string | null;
};

type CreatedOrderResult = CreatedOrderRow | CreatedOrderRow[] | null;

function normalizeCreatedOrderResult(data: CreatedOrderResult) {
  return Array.isArray(data) ? data[0] : data;
}

function rewardRpcErrorCode(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("already been redeemed")) return "REWARD_ALREADY_REDEEMED";
  if (normalized.includes("reward is expired")) return "REWARD_EXPIRED";
  if (normalized.includes("minimum order")) return "REWARD_MINIMUM_ORDER_NOT_REACHED";
  if (normalized.includes("does not belong")) return "REWARD_CUSTOMER_MISMATCH";
  if (normalized.includes("paid delivery")) return "REWARD_NOT_APPLICABLE";
  if (normalized.includes("free product") || normalized.includes("reward is unavailable") || normalized.includes("reward not found")) return "REWARD_UNAVAILABLE";
  return "ORDER_CREATION_FAILED";
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await checkRateLimit(request, {
      keyPrefix: "public:orders:create",
      limit: 12,
      windowMs: 60_000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim().toLowerCase() || "";
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return NextResponse.json(
        { code: "INVALID_IDEMPOTENCY_KEY", error: "Inicie uma nova tentativa de pedido." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as CheckoutPayload;
    const address = normalizeAddress(body.address);
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const paymentMethod = isStorefrontPaymentMethod(body.paymentMethod) ? body.paymentMethod : null;
    const fulfillmentType = body.fulfillmentType === "pickup" ? "pickup" : "delivery";
    const rewardId = typeof body.rewardId === "string" && body.rewardId.trim() ? body.rewardId.trim() : null;

    if (!body.restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    if (!body.customerName?.trim() || !body.customerPhone?.trim()) {
      return NextResponse.json({ error: "Preencha os dados do cliente." }, { status: 400 });
    }

    const phoneDigits = body.customerPhone.replace(/\D/g, "");
    const cepDigits = address.cep.replace(/\D/g, "");
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      return NextResponse.json({ error: "Informe um telefone válido com DDD." }, { status: 400 });
    }
    if (fulfillmentType === "delivery" && !/^\d{8}$/.test(cepDigits)) {
      return NextResponse.json({ error: "Informe um CEP válido." }, { status: 400 });
    }

    const addressErrors = getCheckoutAddressErrors(address);
    const invalidAddressFields = Object.entries(addressErrors)
      .filter(([, message]) => Boolean(message))
      .map(([field]) => field);
    if (fulfillmentType === "delivery" && invalidAddressFields.length > 0) {
      return NextResponse.json(
        {
          code: "INCOMPLETE_ADDRESS",
          error: "Complete e confira o endereço de entrega.",
          fields: invalidAddressFields,
        },
        { status: 400 },
      );
    }

    if (cart.length === 0) {
      return NextResponse.json({ error: "Seu carrinho esta vazio." }, { status: 400 });
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { code: "INVALID_PAYMENT_METHOD", error: "Escolha uma forma de pagamento válida." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();
    const productIds = cart.map((item) => item.productId).filter(Boolean);
    const uniqueProductIds = [...new Set(productIds)];
    const couponCode = body.couponCode?.trim().toUpperCase() || null;

    if (couponCode && rewardId) {
      return NextResponse.json(
        { code: "REWARD_COUPON_CONFLICT", error: "Use um cupom ou um prêmio por pedido." },
        { status: 400 },
      );
    }

    const userPromise = supabase.auth.getUser();
    const rewardContextPromise = rewardId
      ? resolveCustomerPromotionContext(adminSupabase as any)
      : Promise.resolve(null);
    const restaurantPromise = (adminSupabase as any)
      .from("restaurants")
      .select(
        "id, name, phone, whatsapp_number, latitude, longitude, address_zip, address_street, address_number, address_neighborhood, address_city, address_state, delivery_tiers, delivery_rules, work_hours, minimum_order_amount, scheduled_orders_enabled, scheduled_order_lead_minutes, pickup_enabled, accepted_payment_methods",
      )
      .eq("id", body.restaurantId)
      .maybeSingle();
    const productsPromise = (adminSupabase as any)
      .from("products")
      .select("id, name, price, is_active, restaurant_id, addons")
      .eq("restaurant_id", body.restaurantId)
      .in("id", uniqueProductIds);
    const couponPromise = couponCode
      ? (adminSupabase as any)
          .from("coupons")
          .select("*")
          .eq("restaurant_id", body.restaurantId)
          .eq("code", couponCode)
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const couponUsagePromise = couponCode
      ? (adminSupabase as any)
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", body.restaurantId)
          .eq("coupon_code", couponCode)
      : Promise.resolve({ data: null, count: 0, error: null });
    const rewardPromise = rewardId
      ? (adminSupabase as any)
          .from("customer_rewards")
          .select("id, customer_id, reward_type, label, percentage_value, fixed_amount, product_id, minimum_order_amount, status, expires_at")
          .eq("id", rewardId)
          .eq("restaurant_id", body.restaurantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [
      userResult,
      rewardContext,
      restaurantResult,
      productsResult,
      couponResult,
      couponUsageResult,
      rewardResult,
    ] = await Promise.all([
      userPromise,
      rewardContextPromise,
      restaurantPromise,
      productsPromise,
      couponPromise,
      couponUsagePromise,
      rewardPromise,
    ]);

    const user = userResult.data.user;
    const { data: restaurant, error: restaurantError } = restaurantResult;
    const { data: products, error: productsError } = productsResult;
    const { data: coupon, error: couponError } = couponResult;
    const couponUsageCount = couponUsageResult.count || 0;
    const { data: rewardData, error: rewardError } = rewardResult;
    const reward = rewardData as CheckoutReward | null;

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    if (rewardId) {
      if (!rewardContext) {
        return NextResponse.json(
          { code: "REWARD_SESSION_REQUIRED", error: "Entre na sua conta para usar este prêmio." },
          { status: 401 },
        );
      }
      if (rewardContext.phone !== phoneDigits) {
        return NextResponse.json(
          { code: "REWARD_CUSTOMER_MISMATCH", error: "O prêmio pertence a outro cadastro de cliente." },
          { status: 403 },
        );
      }
      if (rewardError || !reward) {
        return NextResponse.json(
          { code: "REWARD_UNAVAILABLE", error: "Este prêmio não está mais disponível." },
          { status: 409 },
        );
      }

      const { data: rewardCustomer } = await (adminSupabase as any)
        .from("customers")
        .select("id, phone")
        .eq("id", reward.customer_id)
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();
      if (!rewardCustomer || String(rewardCustomer.phone || "").replace(/\D/g, "") !== rewardContext.phone) {
        return NextResponse.json(
          { code: "REWARD_CUSTOMER_MISMATCH", error: "O prêmio não pertence a este cliente." },
          { status: 403 },
        );
      }

      if (!(["available", "redeemed"] as string[]).includes(reward.status)) {
        return NextResponse.json(
          { code: "REWARD_UNAVAILABLE", error: "Este prêmio não está mais disponível." },
          { status: 409 },
        );
      }
      if (reward.status === "available" && reward.expires_at && new Date(reward.expires_at).getTime() <= Date.now()) {
        return NextResponse.json(
          { code: "REWARD_EXPIRED", error: "Este prêmio expirou." },
          { status: 409 },
        );
      }
    }

    const acceptedPaymentMethods = normalizeStorefrontPaymentMethods(
      restaurant.accepted_payment_methods,
    );
    if (!acceptedPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json(
        {
          code: "PAYMENT_METHOD_UNAVAILABLE",
          error: "A forma de pagamento escolhida não está disponível nesta loja.",
          acceptedPaymentMethods,
        },
        { status: 400 },
      );
    }

    if (fulfillmentType === "pickup" && !restaurant.pickup_enabled) {
      return NextResponse.json(
        { code: "PICKUP_DISABLED", error: "Esta loja não oferece retirada no local." },
        { status: 400 },
      );
    }

    const now = new Date();
    const storeStatus = getStoreStatus(restaurant.work_hours, now);
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    const scheduleLeadMinutes = Math.max(30, Number(restaurant.scheduled_order_lead_minutes) || 60);

    if (scheduledFor) {
      if (!restaurant.scheduled_orders_enabled) {
        return NextResponse.json(
          { code: "SCHEDULING_DISABLED", error: "Esta loja não aceita pedidos agendados." },
          { status: 400 },
        );
      }

      const earliestSchedule = now.getTime() + scheduleLeadMinutes * 60_000;
      const latestSchedule = now.getTime() + 14 * 24 * 60 * 60_000;
      if (
        !Number.isFinite(scheduledFor.getTime()) ||
        scheduledFor.getTime() < earliestSchedule ||
        scheduledFor.getTime() > latestSchedule
      ) {
        return NextResponse.json(
          {
            code: "INVALID_SCHEDULE",
            error: `Escolha um horário entre ${scheduleLeadMinutes} minutos e 14 dias a partir de agora.`,
          },
          { status: 400 },
        );
      }

      if (getStoreStatus(restaurant.work_hours, scheduledFor).tone === "closed") {
        return NextResponse.json(
          { code: "INVALID_SCHEDULE", error: "Escolha um horário dentro do funcionamento da loja." },
          { status: 400 },
        );
      }
    } else if (storeStatus.tone === "closed") {
      return NextResponse.json(
        {
          code: "STORE_CLOSED",
          error: restaurant.scheduled_orders_enabled
            ? "A loja está fechada agora. Agende seu pedido para continuar."
            : "A loja está fechada e não está recebendo pedidos agora.",
          canSchedule: Boolean(restaurant.scheduled_orders_enabled),
        },
        { status: 409 },
      );
    }

    if (productsError || !products) {
      return NextResponse.json(
        {
          code: "PRODUCT_VALIDATION_UNAVAILABLE",
          error: "Não foi possível conferir os itens agora. Tente novamente.",
        },
        { status: 503 },
      );
    }

    const productsById = new Map(products.map((product: any) => [product.id, product]));
    const unavailableProductIds = uniqueProductIds.filter((productId) => {
      const product = productsById.get(productId) as any;
      return !product || !product.is_active;
    });

    if (unavailableProductIds.length > 0) {
      return NextResponse.json(
        {
          code: "ITEM_UNAVAILABLE",
          error: "Um ou mais itens da sacola não estão mais disponíveis.",
          unavailableProductIds,
        },
        { status: 409 },
      );
    }

    const normalizedItems: Array<{
      product_name: string;
      quantity: number;
      price: number;
      observation: string | null;
      addons: NormalizedAddon[];
      lineTotal: number;
    }> = [];

    let subtotal = 0;

    for (const item of cart) {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const product = productsById.get(item.productId) as any;

      if (!product) continue;

      const { normalized, addonTotal } = resolveAddonSelection(
        Array.isArray(item.selectedAddons) ? item.selectedAddons : [],
        product.addons,
      );

      const unitPrice = roundMoney(Number(product.price) + addonTotal);
      const lineTotal = roundMoney(unitPrice * quantity);
      subtotal += lineTotal;

      normalizedItems.push({
        product_name: product.name,
        quantity,
        price: unitPrice,
        observation: item.observation?.trim() || null,
        addons: normalized,
        lineTotal,
      });
    }

    subtotal = roundMoney(subtotal);

    const minimumOrderAmount = roundMoney(Number(restaurant.minimum_order_amount) || 0);
    if (subtotal < minimumOrderAmount) {
      return NextResponse.json(
        {
          code: "MINIMUM_ORDER_NOT_REACHED",
          error: "O valor mínimo do pedido ainda não foi atingido.",
          minimumOrderAmount,
          missingAmount: roundMoney(minimumOrderAmount - subtotal),
        },
        { status: 400 },
      );
    }

    if (reward?.status === "available") {
      const rewardMinimumOrder = roundMoney(Number(reward.minimum_order_amount) || 0);
      if (subtotal < rewardMinimumOrder) {
        return NextResponse.json(
          {
            code: "REWARD_MINIMUM_ORDER_NOT_REACHED",
            error: "O pedido mínimo deste prêmio ainda não foi atingido.",
            minimumOrderAmount: rewardMinimumOrder,
            missingAmount: roundMoney(rewardMinimumOrder - subtotal),
          },
          { status: 400 },
        );
      }
    }

    let discount = 0;
    let appliedCouponCode: string | null = null;

    if (couponCode) {
      if (couponError || !coupon) {
        return NextResponse.json({ error: "Cupom inválido." }, { status: 400 });
      }

      if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: "Este cupom expirou." }, { status: 400 });
      }

      if (coupon.usage_limit && couponUsageCount >= Number(coupon.usage_limit)) {
        return NextResponse.json(
          { error: "Este cupom atingiu o limite de uso." },
          { status: 400 },
        );
      }

      appliedCouponCode = coupon.code;
      if (coupon.discount_type === "percent") {
        discount = subtotal * (Number(coupon.value) / 100);
      } else {
        discount = Number(coupon.value);
      }
      discount = Math.min(roundMoney(discount), subtotal);
    }

    let deliveryFee = 0;
    let deliveryTime = 0;
    let deliveryDistance: number | null = null;

    if (fulfillmentType === "delivery") {
      try {
        const quote = await calculateDeliveryQuote(restaurant, address, { subtotal });
        deliveryFee = quote.price;
        deliveryTime = quote.time;
        deliveryDistance = quote.distance;
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
        throw error;
      }
    }

    let rewardProductName: string | null = null;
    if (reward?.status === "available") {
      if (reward.reward_type === "percent") {
        discount = Math.min(
          roundMoney(subtotal * (Number(reward.percentage_value || 0) / 100)),
          subtotal,
        );
      } else if (reward.reward_type === "fixed") {
        discount = Math.min(roundMoney(Number(reward.fixed_amount) || 0), subtotal);
      } else if (reward.reward_type === "free_shipping") {
        if (fulfillmentType !== "delivery" || deliveryFee <= 0) {
          return NextResponse.json(
            { code: "REWARD_NOT_APPLICABLE", error: "Este prêmio exige uma entrega com taxa." },
            { status: 400 },
          );
        }
        discount = deliveryFee;
      } else if (reward.reward_type === "free_product") {
        const { data: rewardProduct } = await (adminSupabase as any)
          .from("products")
          .select("id, name, is_active")
          .eq("id", reward.product_id)
          .eq("restaurant_id", restaurant.id)
          .maybeSingle();
        if (!rewardProduct?.is_active) {
          return NextResponse.json(
            { code: "REWARD_UNAVAILABLE", error: "O produto deste prêmio está indisponível." },
            { status: 409 },
          );
        }
        rewardProductName = rewardProduct.name;
        discount = 0;
      }
    }

    let total = roundMoney(subtotal + deliveryFee - discount);
    let normalizedChangeFor: string | null = null;
    if (paymentMethod === "cash" && body.changeFor?.trim()) {
      const changeError = getChangeForError(body.changeFor, total);
      const changeAmount = parseCurrencyInput(body.changeFor);
      if (changeError || changeAmount === null) {
        return NextResponse.json(
          { code: "INVALID_CHANGE_FOR", error: changeError || "Informe um valor válido para o troco." },
          { status: 400 },
        );
      }
      normalizedChangeFor = changeAmount.toFixed(2);
    }

    const orderAddress = {
      ...(fulfillmentType === "pickup" ? {
        cep: restaurant.address_zip || "",
        street: restaurant.address_street || "Retirada na loja",
        number: restaurant.address_number || "S/N",
        neighborhood: restaurant.address_neighborhood || "",
        city: restaurant.address_city || "",
        state: restaurant.address_state || "",
        complement: "",
      } : address),
      fulfillment_type: fulfillmentType,
      distance: deliveryDistance,
      delivery_calculated: fulfillmentType === "delivery",
      distance_method: fulfillmentType === "delivery" ? "road_route" : null,
    };

    const transactionItems = normalizedItems.map((item) => ({
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      observation: item.observation,
      addons: item.addons,
    }));

    const transaction = rewardId
      ? await (adminSupabase as any).rpc("create_storefront_order_with_reward_transaction", {
          p_restaurant_id: restaurant.id,
          p_customer_name: body.customerName.trim(),
          p_customer_phone: phoneDigits,
          p_address: orderAddress,
          p_items: transactionItems,
          p_subtotal: subtotal,
          p_delivery_fee: deliveryFee,
          p_payment_method: paymentMethod,
          p_change_for: normalizedChangeFor,
          p_user_id: user?.id || null,
          p_scheduled_for: scheduledFor?.toISOString() || null,
          p_save_customer: true,
          p_idempotency_key: idempotencyKey,
          p_reward_id: rewardId,
        })
      : await (adminSupabase as any).rpc("create_storefront_order_transaction", {
          p_restaurant_id: restaurant.id,
          p_customer_name: body.customerName.trim(),
          p_customer_phone: phoneDigits,
          p_address: orderAddress,
          p_items: transactionItems,
          p_subtotal: subtotal,
          p_delivery_fee: deliveryFee,
          p_discount: discount,
          p_total: total,
          p_payment_method: paymentMethod,
          p_change_for: normalizedChangeFor,
          p_coupon_code: appliedCouponCode,
          p_user_id: user?.id || null,
          p_scheduled_for: scheduledFor?.toISOString() || null,
          p_save_customer: true,
          p_idempotency_key: idempotencyKey,
        });

    const createdOrder = normalizeCreatedOrderResult(transaction.data as CreatedOrderResult);

    if (transaction.error || !createdOrder) {
      console.error("Erro ao criar pedido em transacao:", transaction.error);
      const code = rewardId ? rewardRpcErrorCode(transaction.error?.message) : "ORDER_CREATION_FAILED";
      const messages: Record<string, string> = {
        REWARD_ALREADY_REDEEMED: "Este prêmio já foi usado em outro pedido.",
        REWARD_EXPIRED: "Este prêmio expirou.",
        REWARD_MINIMUM_ORDER_NOT_REACHED: "O pedido mínimo deste prêmio ainda não foi atingido.",
        REWARD_CUSTOMER_MISMATCH: "Este prêmio não pertence a este cliente.",
        REWARD_NOT_APPLICABLE: "Este prêmio não pode ser usado neste pedido.",
        REWARD_UNAVAILABLE: "Este prêmio não está mais disponível.",
      };
      return NextResponse.json(
        { code, error: messages[code] || "Não foi possível registrar o pedido. Tente novamente." },
        { status: code === "ORDER_CREATION_FAILED" ? 400 : 409 },
      );
    }

    if (rewardId) {
      if (createdOrder.reward_discount != null) discount = roundMoney(Number(createdOrder.reward_discount));
      if (createdOrder.order_total != null) total = roundMoney(Number(createdOrder.order_total));
    }

    const orderId = createdOrder.order_id;
    const displayNumber = String(createdOrder.display_number).padStart(4, "0");
    const trackingToken = createOrderTrackingToken(orderId);
    const trackingPath = `/acompanhar/${orderId}?token=${encodeURIComponent(trackingToken)}`;
    const trackingUrl = new URL(trackingPath, request.url).toString();

    if (hasCurrentUser(user)) {
      try {
        const profileSyncs: Array<Promise<unknown>> = [
          (supabase as any).from("profiles").upsert({
            id: user!.id,
            name: body.customerName.trim(),
            phone: phoneDigits,
            updated_at: new Date().toISOString(),
          }),
        ];

        if (body.saveAddress === true && !body.usingSavedAddress && fulfillmentType === "delivery") {
          profileSyncs.push(
            (supabase as any).from("customer_addresses").insert({
              user_id: user!.id,
              cep: address.cep,
              street: address.street,
              number: address.number,
              neighborhood: address.neighborhood,
              city: address.city,
              state: address.state,
              complement: address.complement,
            }),
          );
        }

        await Promise.all(profileSyncs);
      } catch (profileError) {
        console.error("Falha ao sincronizar perfil/endereço do cliente:", profileError);
      }
    }

    let customerSession: Awaited<ReturnType<typeof ensureCustomerAccount>> = null;
    try {
      customerSession = await ensureCustomerAccount(adminSupabase as any, {
        name: body.customerName.trim(),
        phone: phoneDigits,
        address,
        authenticatedUserId: user?.id || null,
      });
    } catch (customerAccountError) {
      console.error("Falha ao criar conta automatica do cliente:", customerAccountError);
    }

    const responseItems = rewardProductName
      ? [
          ...normalizedItems,
          {
            product_name: rewardProductName,
            quantity: 1,
            price: 0,
            observation: "Prêmio da Roleta da Sorte",
            addons: [] as NormalizedAddon[],
            lineTotal: 0,
          },
        ]
      : normalizedItems;

    const response = NextResponse.json({
      orderId,
      displayNumber,
      trackingPath,
      trackingUrl,
      restaurantPhone: restaurant.phone || restaurant.whatsapp_number || "",
      subtotal,
      deliveryFee,
      deliveryTime,
      deliveryDistance,
      discount,
      total,
      paymentMethod,
      changeFor: normalizedChangeFor,
      scheduledFor: scheduledFor?.toISOString() || null,
      fulfillmentType,
      address: orderAddress,
      items: responseItems,
      reward: rewardId ? {
        id: createdOrder.reward_id || rewardId,
        type: createdOrder.reward_type || reward?.reward_type || null,
        label: createdOrder.reward_label || reward?.label || null,
      } : null,
    });
    if (customerSession) {
      response.cookies.set(CUSTOMER_SESSION_COOKIE, customerSession.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: customerSession.expiresAt,
        maxAge: customerSession.maxAge,
      });
    }
    return response;
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return NextResponse.json({ error: "Erro interno ao finalizar pedido." }, { status: 500 });
  }
}
