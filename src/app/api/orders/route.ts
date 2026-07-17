import { NextResponse } from "next/server";
import { calculateDeliveryFee, calculateDistance, getCoordinates } from "@/lib/geo";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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
  cart?: CheckoutItem[];
  usingSavedAddress?: boolean;
  saveAddress?: boolean;
  clientCoords?: { lat: number; lon: number } | null;
  deliveryPreview?: { price: number; time: number; distance: number; valid: boolean } | null;
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
    state: address.state?.trim() || "",
    complement: address.complement?.trim() || "",
  };
}

function buildAddressQuery(address: ReturnType<typeof normalizeAddress>) {
  return [
    address.cep,
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveAddonSelection(selectedAddons: CheckoutAddon[], productAddons: unknown) {
  if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) {
    return {
      normalized: [] as Array<{ groupId?: string; name: string; price: number }>,
      addonTotal: 0,
    };
  }

  const groups = Array.isArray(productAddons) ? productAddons : [];
  const normalized: Array<{ groupId?: string; name: string; price: number }> = [];
  let addonTotal = 0;

  for (const selected of selectedAddons) {
    if (!selected?.name) continue;

    let matchedOption: Record<string, unknown> | undefined;

    if (selected.groupId) {
      const group = groups.find(
        (item) => isRecord(item) && String(item.id ?? "") === selected.groupId,
      ) as Record<string, unknown> | undefined;
      const options = Array.isArray(group?.options) ? group.options : [];
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
          matchedOption = option;
          break;
        }
      }
    }

    if (!matchedOption) {
      throw new Error(`Complemento inválido: ${selected.name}`);
    }

    const optionPrice = parseNumber(matchedOption.price);
    addonTotal += optionPrice;
    normalized.push({
      groupId: selected.groupId,
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

type CreatedOrderResult =
  | { order_id: string; display_number: number }
  | Array<{ order_id: string; display_number: number }>
  | null;

function normalizeCreatedOrderResult(data: CreatedOrderResult) {
  return Array.isArray(data) ? data[0] : data;
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = checkRateLimit(request, {
      keyPrefix: "public:orders:create",
      limit: 12,
      windowMs: 60_000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = (await request.json()) as CheckoutPayload;
    const address = normalizeAddress(body.address);
    const cart = Array.isArray(body.cart) ? body.cart : [];

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
    if (!/^\d{8}$/.test(cepDigits)) {
      return NextResponse.json({ error: "Informe um CEP válido." }, { status: 400 });
    }

    if (!address.street || !address.number || !address.neighborhood) {
    return NextResponse.json({ error: "Informe o endereço de entrega." }, { status: 400 });
    }

    if (cart.length === 0) {
      return NextResponse.json({ error: "Seu carrinho esta vazio." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const adminSupabase = createAdminClient();
    const { data: restaurant, error: restaurantError } = await adminSupabase
      .from("restaurants")
      .select(
        "id, name, phone, whatsapp_number, latitude, longitude, address_zip, address_street, address_number, address_neighborhood, address_city, address_state, delivery_tiers",
      )
      .eq("id", body.restaurantId)
      .maybeSingle();

    if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
    }

    const productIds = cart.map((item) => item.productId).filter(Boolean);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, is_active, restaurant_id, addons")
      .eq("restaurant_id", restaurant.id)
      .in("id", productIds);

    if (productsError || !products) {
      return NextResponse.json(
      { error: "Não foi possível validar os produtos." },
        { status: 400 },
      );
    }

    const productsById = new Map(products.map((product) => [product.id, product]));
    const normalizedItems: Array<{
      product_name: string;
      quantity: number;
      price: number;
      observation: string | null;
      addons: Array<{ groupId?: string; name: string; price: number }>;
      lineTotal: number;
    }> = [];

    let subtotal = 0;

    for (const item of cart) {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const product = productsById.get(item.productId);

      if (!product || !product.is_active) {
        return NextResponse.json(
      { error: "Um dos itens do carrinho não está mais disponível." },
          { status: 400 },
        );
      }

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

    let discount = 0;
    let appliedCouponCode: string | null = null;

    if (body.couponCode?.trim()) {
      const couponCode = body.couponCode.trim().toUpperCase();
      const { data: coupon, error: couponError } = await (supabase as any)
        .from("coupons")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("code", couponCode)
        .eq("active", true)
        .maybeSingle();

      if (couponError || !coupon) {
        return NextResponse.json({ error: "Cupom inválido." }, { status: 400 });
      }

      if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: "Este cupom expirou." }, { status: 400 });
      }

      if (coupon.usage_limit) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("coupon_code", coupon.code);

        if ((count || 0) >= Number(coupon.usage_limit)) {
          return NextResponse.json(
            { error: "Este cupom atingiu o limite de uso." },
            { status: 400 },
          );
        }
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
    let deliveryCalculated = false;
    const tiers = Array.isArray(restaurant.delivery_tiers) ? restaurant.delivery_tiers : [];

    let restaurantCoords =
      restaurant.latitude !== null && restaurant.longitude !== null
        ? { lat: Number(restaurant.latitude), lon: Number(restaurant.longitude) }
        : null;

    if (!restaurantCoords) {
      if (restaurant.address_street && restaurant.address_city && restaurant.address_state) {
        restaurantCoords = await getCoordinates({
          postalCode: restaurant.address_zip || undefined,
          street: restaurant.address_street || undefined,
          number: restaurant.address_number || undefined,
          neighborhood: restaurant.address_neighborhood || undefined,
          city: restaurant.address_city || undefined,
          state: restaurant.address_state || undefined,
        });
      }
    }

    let clientCoords: { lat: number; lon: number } | null = null;
    const addressQuery = buildAddressQuery(address);

    if (addressQuery) {
      clientCoords = await getCoordinates({
        postalCode: address.cep,
        street: address.street,
        number: address.number,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      });
    }

    if (restaurantCoords && clientCoords) {
      const distance = calculateDistance(
        restaurantCoords.lat,
        restaurantCoords.lon,
        clientCoords.lat,
        clientCoords.lon,
      );
      const fee = calculateDeliveryFee(distance, tiers);

      deliveryDistance = distance;
      deliveryTime = fee.time;
      deliveryCalculated = true;

      if (!fee.valid && tiers.length > 0) {
        return NextResponse.json(
      { error: "O endereço informado está fora da área de entrega." },
          { status: 400 },
        );
      }

      deliveryFee = roundMoney(fee.price);
    }

    const total = roundMoney(subtotal + deliveryFee - discount);
    const orderAddress = {
      ...address,
      distance: deliveryDistance,
      delivery_calculated: deliveryCalculated,
    };
    const transactionItems = normalizedItems.map((item) => ({
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price,
      observation: item.observation,
      addons: item.addons,
    }));
    const { data: createdOrderData, error: createOrderError } = await adminSupabase.rpc(
      "create_order_transaction",
      {
        p_restaurant_id: restaurant.id,
        p_customer_name: body.customerName.trim(),
        p_customer_phone: phoneDigits,
        p_address: orderAddress,
        p_items: transactionItems,
        p_subtotal: subtotal,
        p_delivery_fee: deliveryFee,
        p_discount: discount,
        p_total: total,
        p_payment_method: body.paymentMethod || "pix",
        p_change_for: body.changeFor?.trim() || null,
        p_coupon_code: appliedCouponCode,
        p_user_id: user?.id || null,
        p_status: "pending",
        p_external_source: null,
        p_external_order_id: null,
        p_external_display_id: null,
        p_is_test: false,
        p_external_payload: null,
        p_save_customer: true,
      },
    );
    const createdOrder = normalizeCreatedOrderResult(createdOrderData as CreatedOrderResult);

    if (createOrderError || !createdOrder) {
      console.error("Erro ao criar pedido em transacao:", createOrderError);
      return NextResponse.json(
        { error: createOrderError?.message || "Nao foi possivel criar o pedido." },
        { status: 400 },
      );
    }

    const orderId = createdOrder.order_id;
    const displayNumber = String(createdOrder.display_number).padStart(4, "0");

    if (hasCurrentUser(user)) {
      try {
        await (supabase as any).from("profiles").upsert({
          id: user!.id,
          name: body.customerName.trim(),
          phone: phoneDigits,
          updated_at: new Date().toISOString(),
        });

        if (body.saveAddress === true && !body.usingSavedAddress) {
          await (supabase as any).from("customer_addresses").insert({
            user_id: user!.id,
            cep: address.cep,
            street: address.street,
            number: address.number,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            complement: address.complement,
          });
        }
      } catch (profileError) {
        console.error("Falha ao sincronizar perfil/endereço do cliente:", profileError);
      }
    }


    return NextResponse.json({
      orderId,
      displayNumber,
      restaurantPhone: restaurant.phone || restaurant.whatsapp_number || "",
      subtotal,
      deliveryFee,
      deliveryTime,
      deliveryDistance,
      discount,
      total,
      paymentMethod: body.paymentMethod || "pix",
      address,
      items: normalizedItems,
    });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    return NextResponse.json({ error: "Erro interno ao finalizar pedido." }, { status: 500 });
  }
}
