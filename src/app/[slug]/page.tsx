"use client";

import { useCallback, useState } from "react";
import {
  Bike,
  Check,
  Clock3,
  Loader2,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Star,
  X,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { calculateDistance, calculateDeliveryFee, getCoordinates } from "@/lib/geo";
import { useToast } from "@/components/ui/toast-provider";
import { CheckoutDrawer } from "@/features/storefront/CheckoutDrawer";
import { ProductPicker } from "@/features/storefront/ProductPicker";
import { EMPTY_ADDRESS } from "@/features/storefront/constants";
import { formatMoney, hexToRgba } from "@/features/storefront/format";
import type { CheckoutStep, DeliveryInfo, OrderResponse } from "@/features/storefront/types";
import { useCart } from "@/features/storefront/use-cart";
import { useStorefront } from "@/features/storefront/use-storefront";

export default function StorePage() {
  const params = useParams<{ slug: string | string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { showToast } = useToast();
  const [usingSavedAddress, setUsingSavedAddress] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  const [step, setStep] = useState<CheckoutStep>("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [clientCoords, setClientCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [changeFor, setChangeFor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    value: number;
    type: string;
  } | null>(null);
  const [verifyingCoupon, setVerifyingCoupon] = useState(false);
  const [lastOrderSummary, setLastOrderSummary] = useState<OrderResponse | null>(null);

  const handleCustomerLoaded = useCallback((profile: { name: string; phone: string }) => {
    setCustomerName(profile.name);
    setCustomerPhone(profile.phone);
  }, []);

  const handleMissingStore = useCallback(() => {
    showToast({
      title: "Loja não encontrada",
      description: "Confira o link da vitrine e tente novamente.",
      tone: "error",
    });
  }, [showToast]);

  const {
    supabase,
    currentUser,
    savedAddresses,
    restaurant,
    primaryColor,
    banners,
    currentBanner,
    storefrontHeadline,
    storefrontSubheadline,
    storefrontTheme,
    categories,
    products,
    deliveryTiers,
    loading,
    restoCoords,
    activeCategory,
    setActiveCategory,
  } = useStorefront({
    slug,
    onCustomerLoaded: handleCustomerLoaded,
    onMissingStore: handleMissingStore,
  });

  const {
    selectedProduct,
    addonSelections,
    quantity,
    observation,
    cart,
    cartSubtotal,
    setQuantity,
    setObservation,
    openProduct,
    closeProduct,
    toggleAddon,
    calculateProductTotal,
    addToCart,
    removeFromCart,
    clearCart,
  } = useCart();

  const calculateDeliveryForAddress = async (addressData: typeof EMPTY_ADDRESS) => {
    if (!restoCoords) return;
    if (!addressData.street || !addressData.city || !addressData.state) return;

    setCalculatingFee(true);

    try {
      const clientCoords = await getCoordinates({
        postalCode: addressData.cep,
        street: addressData.street,
        number: addressData.number,
        neighborhood: addressData.neighborhood,
        city: addressData.city,
        state: addressData.state,
      });

      if (clientCoords) {
        setClientCoords(clientCoords);
        const dist = calculateDistance(
          restoCoords.lat,
          restoCoords.lon,
          clientCoords.lat,
          clientCoords.lon,
        );
        const feeData = calculateDeliveryFee(dist, deliveryTiers);
        setDeliveryInfo({
          price: feeData.price,
          time: feeData.time,
          distance: dist,
          valid: feeData.valid,
        });
      } else {
        setClientCoords(null);
        setDeliveryInfo(null);
      }
    } catch (error) {
      console.error(error);
      setClientCoords(null);
      setDeliveryInfo(null);
    } finally {
      setCalculatingFee(false);
    }
  };

  const handleBlurCep = async () => {
    const cepLimpo = address.cep.replace(/\D/g, "");
    if (cepLimpo.length < 8) return;

    setDeliveryInfo(null);

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (!data.erro) {
        const nextAddress = {
          ...address,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        };

        setAddress((prev) => ({
          ...prev,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        }));

        if (nextAddress.number) {
          await calculateDeliveryForAddress(nextAddress);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const feeValue = deliveryInfo?.valid ? deliveryInfo.price : 0;
  const hasAddressMinimum = Boolean(address.street && address.number && address.neighborhood);
  let discountAmount = 0;

  if (appliedCoupon) {
    if (appliedCoupon.type === "percent") {
      discountAmount = cartSubtotal * (appliedCoupon.value / 100);
    } else {
      discountAmount = appliedCoupon.value;
    }
  }

  if (discountAmount > cartSubtotal) discountAmount = cartSubtotal;

  const finalTotal = cartSubtotal + feeValue - discountAmount;

  const handleApplyCoupon = async () => {
    if (!couponCode) return;

    setVerifyingCoupon(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase().trim())
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .single();

      if (error || !data) {
        showToast({
          title: "Cupom inválido",
          description: "Revise o código informado.",
          tone: "error",
        });
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          value: data.value,
          type: data.discount_type,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setVerifyingCoupon(false);
    }
  };

  const sendToWhatsApp = (summary: OrderResponse) => {
    const orderLabel = summary.displayNumber || summary.orderId.slice(0, 4).toUpperCase();
    const itemsList = summary.items
      .map((item) => {
        const addons = item.addons.map((addon) => `+ ${addon.name}`).join(", ");
        return `- ${item.quantity}x ${item.product_name}${addons ? ` (${addons})` : ""}${
          item.observation ? `\n  Obs: ${item.observation}` : ""
        }`;
      })
      .join("\n");

    const deliveryLine =
      summary.deliveryFee > 0
        ? `${formatMoney(summary.deliveryFee)} (${summary.deliveryTime} min)`
        : summary.deliveryDistance
          ? `Sem taxa (${summary.deliveryTime} min)`
          : "A combinar";

    const msg =
      `NOVO PEDIDO #${orderLabel}\n\n` +
      `Cliente: ${customerName}\n` +
      `Endereço: ${summary.address.street}, ${summary.address.number}` +
      `${summary.address.complement ? `, ${summary.address.complement}` : ""}\n` +
      `${summary.address.neighborhood} - ${summary.address.city}/${summary.address.state}\n\n` +
      `PEDIDO:\n${itemsList}\n\n` +
      `Subtotal: ${formatMoney(summary.subtotal)}\n` +
      `Entrega: ${deliveryLine}\n` +
      `${summary.discount > 0 ? `Desconto: -${formatMoney(summary.discount)}\n` : ""}` +
      `TOTAL: ${formatMoney(summary.total)}\n` +
      `Pagamento: ${summary.paymentMethod}`;

    const phone = summary.restaurantPhone || restaurant.phone || "5511999999999";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handlePlaceOrder = async () => {
    if (!customerName || !customerPhone || !address.street || !address.number) {
      showToast({
        title: "Dados incompletos",
        description: "Preencha nome, WhatsApp e endereço para continuar.",
        tone: "error",
      });
      return;
    }
    if (!hasAddressMinimum) {
      showToast({
        title: "Endereço incompleto",
        description: "Informe rua, número e bairro para seguir.",
        tone: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerName,
          customerPhone,
          address,
          paymentMethod,
          changeFor,
          couponCode: appliedCoupon?.code || null,
          usingSavedAddress,
          clientCoords,
          deliveryPreview: deliveryInfo,
          cart: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            selectedAddons: item.selectedAddons,
            observation: item.observation,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao finalizar pedido.");
      }

      setLastOrderSummary(result);
      sendToWhatsApp(result);
      setStep("success");
      clearCart();
      setAppliedCoupon(null);
    } catch (error: any) {
      showToast({
        title: "Não foi possível finalizar o pedido",
        description: error.message || "Tente novamente em instantes.",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectSavedAddress = async (savedAddr: any) => {
    const nextAddress = {
      cep: savedAddr.cep,
      street: savedAddr.street,
      number: savedAddr.number,
      neighborhood: savedAddr.neighborhood,
      city: savedAddr.city,
      state: savedAddr.state,
      complement: savedAddr.complement || "",
    };

    setAddress(nextAddress);
    setUsingSavedAddress(true);
    await calculateDeliveryForAddress(nextAddress);
  };

  const resetCheckout = () => {
    setStep("cart");
    setIsCartOpen(false);
    setDeliveryInfo(null);
    setClientCoords(null);
    setAppliedCoupon(null);
    setLastOrderSummary(null);
  };

  const contrastColor = storefrontTheme.contrast_color || "#1f2937";
  const pageBackground = hexToRgba(primaryColor || "#ff5a1f", 0.07);
  const heroBackground = `linear-gradient(135deg, ${primaryColor || "#ff5a1f"} 0%, ${contrastColor} 100%)`;
  const heroTitle =
    storefrontHeadline || restaurant?.name || "Sua vitrine digital com pedidos no WhatsApp";
  const heroSubtitle =
    storefrontSubheadline ||
    restaurant?.description ||
    "Monte seu pedido, personalize os itens e finalize direto com a loja.";
  const showHeroHeadline = !storefrontTheme.show_logo;
  const showHeroSupportText = showHeroHeadline || storefrontTheme.hero_style === "spotlight";
  const cardTone =
    storefrontTheme.card_style === "outline"
      ? "border-2 border-[var(--line)] bg-white shadow-none"
      : storefrontTheme.card_style === "elevated"
        ? "border border-white/60 bg-white shadow-[0_24px_48px_rgba(17,16,15,0.12)]"
      : "border border-[var(--line)] bg-white shadow-[0_10px_25px_rgba(17,16,15,0.05)]";
  const catalogGridClass =
    storefrontTheme.catalog_layout === "list"
      ? "grid-cols-1"
      : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  const usesHeroBanner =
    storefrontTheme.show_banners && (banners.length > 0 || Boolean(restaurant?.image_url));
  const heroHeightClass =
    storefrontTheme.hero_style === "spotlight"
      ? "h-[156px] sm:h-[240px]"
      : storefrontTheme.hero_style === "split"
        ? "h-[148px] sm:h-[220px]"
        : "h-[136px] sm:h-[200px]";
  const totalProducts = products.length;
  const featuredProduct = products[0] || null;
  const hasFreeDelivery = deliveryTiers.some((tier: any) => Number(tier.price || 0) === 0);
  const visibleProducts = products.filter((product) => {
    const term = menuSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) ||
      (product.description || "").toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: pageBackground }}>
        <Loader2 className="animate-spin text-[var(--brand)]" size={28} />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea] px-6 py-12">
        <div className="surface-card w-full max-w-lg rounded-[28px] p-8 text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <ShoppingBag size={30} />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-gray-950">
            Loja não encontrada
          </h1>
          <p className="mt-3 text-base leading-7 text-[var(--muted)]">
            Confira se o link da vitrine está correto ou acesse novamente pelo painel.
          </p>
          <button
            onClick={() => router.push("/admin")}
            className="mt-8 w-full rounded-2xl px-6 py-4 text-sm font-black text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea] px-6 py-12">
        <div className="surface-card w-full max-w-xl rounded-[32px] p-8 text-center">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Check size={38} />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-gray-950">
            Pedido recebido
          </h1>
          {lastOrderSummary?.displayNumber && (
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-400">
              Pedido #{lastOrderSummary.displayNumber}
            </p>
          )}
          <p className="mt-3 text-base leading-7 text-[var(--muted)]">
            A loja já recebeu seu pedido e você pode confirmar tudo no WhatsApp.
          </p>
          <button
            onClick={() => lastOrderSummary && sendToWhatsApp(lastOrderSummary)}
            className="mt-8 w-full rounded-2xl bg-[#25D366] px-6 py-4 text-base font-bold text-white"
          >
            <span className="inline-flex items-center gap-2">
              <Send size={18} />
              Enviar no WhatsApp
            </span>
          </button>
          <button
            onClick={resetCheckout}
            className="mt-4 w-full rounded-2xl border border-[var(--line)] bg-white px-6 py-4 text-sm font-bold text-gray-700"
          >
            Voltar ao cardápio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 text-gray-950" style={{ backgroundColor: pageBackground }}>
      <section className="bg-white">
        <div className="mx-auto w-full max-w-5xl px-0 pb-3 sm:px-4 sm:pb-5">
          <div className="relative overflow-hidden rounded-b-[18px] sm:rounded-[28px]">
            <div className={`relative bg-gray-200 ${heroHeightClass}`}>
            {usesHeroBanner && banners.length > 0 ? (
              banners.map((banner, index) => (
                <img
                  key={banner}
                  src={banner}
                  alt={`Banner ${index + 1}`}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                    index === currentBanner ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))
            ) : usesHeroBanner && restaurant.image_url ? (
              <img src={restaurant.image_url} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full" style={{ background: heroBackground }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className={`absolute inset-x-0 bottom-0 p-4 sm:p-7 ${
              storefrontTheme.hero_style === "split" ? "text-right" : ""
            }`}>
              {storefrontTheme.show_promo_badge && storefrontTheme.promo_text && (
                <span
                  className="mb-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] sm:mb-4 sm:px-3 sm:text-xs"
                  style={{ backgroundColor: "rgba(255,255,255,0.92)", color: contrastColor }}
                >
                  {storefrontTheme.promo_text}
                </span>
              )}
              {showHeroHeadline && (
                <h2 className={`text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl ${
                  storefrontTheme.hero_style === "split" ? "ml-auto max-w-lg" : "max-w-2xl"
                }`}>
                  {heroTitle}
                </h2>
              )}
              {showHeroSupportText && (
                <p className={`${showHeroHeadline ? "mt-1.5 sm:mt-3" : ""} max-w-xl text-xs leading-5 text-white/85 sm:text-base sm:leading-7 ${
                  storefrontTheme.hero_style === "split" ? "ml-auto max-w-lg" : "max-w-2xl"
                }`}>
                  {heroSubtitle}
                </p>
              )}
            </div>
            </div>
          </div>

          <div className="-mt-1 relative z-10 px-3 sm:mt-0 sm:px-0">
            <div className="flex min-w-0 items-end gap-3 sm:gap-5">
              {storefrontTheme.show_logo && (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-[3px] border-white bg-white shadow-[0_10px_24px_rgba(17,16,15,0.14)] sm:h-20 sm:w-20 sm:rounded-[18px] sm:border-4">
                  {restaurant.logo_url ? (
                    <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
                  ) : restaurant.image_url ? (
                    <img src={restaurant.image_url} alt={restaurant.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black" style={{ color: primaryColor }}>
                      {restaurant.name.charAt(0)}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1 pb-2 pt-6 sm:pt-8">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="truncate pr-2 text-[20px] font-black leading-tight tracking-tight text-gray-950 sm:text-[28px]">
                    {restaurant.name}
                  </h1>
                  <div className="sm:hidden">
                    {currentUser ? (
                      <button
                        onClick={() => router.push("/minha-conta")}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700"
                      >
                        Minha conta
                      </button>
                    ) : (
                      <button
                        onClick={() => router.push(`/auth?returnUrl=${encodeURIComponent(pathname)}`)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700"
                      >
                        Entrar
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] font-medium text-gray-600 sm:mt-2.5 sm:text-sm">
                  {storefrontTheme.show_reviews && (
                    <span className="inline-flex items-center gap-1">
                      <Star size={13} className="fill-yellow-400 text-yellow-400 sm:h-[15px] sm:w-[15px]" />
                      {restaurant.rating_average ? Number(restaurant.rating_average).toFixed(1) : "Novo"}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} className="sm:h-[15px] sm:w-[15px]" />
                    30-45 min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bike size={13} className="sm:h-[15px] sm:w-[15px]" />
                    {deliveryTiers.length > 0 ? "Entrega por distância" : "Entrega grátis"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Aberto
                  </span>
                  {storefrontTheme.show_featured_badge && storefrontTheme.highlight_badge && (
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]"
                      style={{
                        backgroundColor: hexToRgba(contrastColor, 0.14),
                        color: contrastColor,
                      }}
                    >
                      {storefrontTheme.highlight_badge}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-2.5 py-2 sm:px-6">
          <div className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-[#f7f7f7] px-3 sm:h-10 sm:mb-2.5 sm:gap-2.5 sm:px-3.5">
            <Search size={16} className="text-gray-400" />
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Buscar no cardápio"
              className="w-full bg-transparent text-[12px] font-medium outline-none placeholder:text-gray-400 sm:text-sm"
            />
            {menuSearch && (
              <button onClick={() => setMenuSearch("")} className="text-gray-400">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  document.getElementById(`cat-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`whitespace-nowrap text-[11px] font-bold transition-colors sm:text-sm ${
                  storefrontTheme.category_style === "pill"
                    ? "rounded-full px-2.5 py-1.5 sm:px-3"
                    : "border-b-2 px-1 pb-1"
                } ${
                  activeCategory === category.id
                    ? "text-gray-950"
                    : storefrontTheme.category_style === "pill"
                      ? "bg-transparent text-gray-500"
                      : "border-transparent text-gray-500"
                }`}
                style={
                  activeCategory === category.id
                    ? storefrontTheme.category_style === "pill"
                      ? { backgroundColor: hexToRgba(primaryColor || "#ff5a1f", 0.14), color: primaryColor }
                      : { borderColor: primaryColor, color: primaryColor }
                    : undefined
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-2.5 py-3 sm:px-6 sm:py-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {menuSearch && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700">
                {visibleProducts.length} resultado(s) para &quot;{menuSearch}&quot;
              </div>
            )}

            {categories.map((category) => {
              const categoryProducts = visibleProducts.filter((product) => product.category_id === category.id);
              if (categoryProducts.length === 0) return null;

              return (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-24 overflow-hidden rounded-[18px] border border-gray-200 bg-white sm:rounded-[22px]">
                  <div className="border-b border-gray-100 px-3 py-2.5 sm:px-5 sm:py-3">
                    <h2 className="text-[15px] font-black text-gray-950 sm:text-[17px]">{category.name}</h2>
                    <p className="mt-0.5 text-[10px] font-medium text-gray-500 sm:text-[11px]">{categoryProducts.length} itens</p>
                  </div>

                  <div
                    className={
                      storefrontTheme.catalog_layout === "list"
                        ? "divide-y divide-gray-100"
                        : `divide-y divide-gray-100 sm:grid sm:gap-3 sm:divide-y-0 sm:p-4 ${catalogGridClass}`
                    }
                  >
                    {categoryProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => openProduct(product)}
                        className={`group text-left transition-all hover:-translate-y-0.5 ${
                          storefrontTheme.catalog_layout === "list"
                            ? "flex w-full gap-3 px-3 py-3 hover:bg-[#fafafa] sm:px-5 sm:py-3.5"
                            : `flex w-full gap-3 px-3 py-3 hover:bg-[#fafafa] sm:block sm:rounded-[20px] sm:p-3 ${cardTone}`
                        }`}
                      >
                        <div className={`min-w-0 flex-1 ${storefrontTheme.catalog_layout === "list" ? "flex-1" : "sm:block"}`}>
                          <h3 className="text-[13px] font-bold leading-snug text-gray-950 sm:text-[15px]">{product.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-gray-500 sm:mt-1 sm:text-[13px] sm:leading-5">{product.description}</p>
                          <p className="mt-1.5 text-[13px] font-black text-gray-950 sm:mt-2 sm:text-[14px]">{formatMoney(product.price)}</p>
                        </div>
                        <div className={`relative overflow-hidden rounded-xl bg-gray-100 ${
                          storefrontTheme.catalog_layout === "list"
                            ? "h-[72px] w-[72px] flex-shrink-0 sm:h-24 sm:w-24"
                            : "h-[72px] w-[72px] flex-shrink-0 sm:mt-3 sm:h-32 sm:w-full"
                        }`}>
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-300">
                              <ShoppingBag size={24} />
                            </div>
                          )}
                          <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm sm:bottom-2 sm:right-2 sm:h-6 sm:w-6" style={{ color: primaryColor }}>
                            <Plus size={13} className="sm:h-[15px] sm:w-[15px]" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

            {visibleProducts.length === 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
                <Search className="mx-auto text-gray-300" size={36} />
                <p className="mt-3 font-bold text-gray-900">Nenhum item encontrado</p>
                <p className="mt-1 text-sm text-gray-500">Tente buscar por outro nome ou categoria.</p>
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-lg font-black text-gray-950">Sua sacola</h3>
              {cart.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingBag className="mx-auto text-gray-300" size={36} />
                  <p className="mt-3 text-sm font-medium text-gray-500">Adicione itens para montar seu pedido.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {cart.slice(0, 3).map((item) => (
                    <div key={item.internalId} className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-700">{item.quantity}x {item.product.name}</span>
                      <span className="font-bold text-gray-950">{formatMoney(item.totalPrice)}</span>
                    </div>
                  ))}
                  {cart.length > 3 && <p className="text-xs font-bold text-gray-400">+ {cart.length - 3} item(ns)</p>}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-base font-black">
                      <span>Total</span>
                      <span>{formatMoney(cartSubtotal)}</span>
                    </div>
                    <button
                      onClick={() => {
                        setStep("cart");
                        setIsCartOpen(true);
                      }}
                      className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Ver sacola
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-0 right-0 z-40 px-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => {
                setStep("cart");
                setIsCartOpen(true);
              }}
              className="w-full rounded-[24px] px-5 py-4 text-white shadow-[0_18px_45px_rgba(17,16,15,0.18)]"
              style={{ backgroundColor: primaryColor }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/15 text-sm font-black">
                    {cart.length}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                      Sacola
                    </p>
                    <p className="text-base font-black">Ver pedido</p>
                  </div>
                </div>
                <p className="text-lg font-black">{formatMoney(cartSubtotal)}</p>
              </div>
            </button>
          </div>
        </div>
      )}

      <ProductPicker
        product={selectedProduct}
        primaryColor={primaryColor}
        addonSelections={addonSelections}
        quantity={quantity}
        observation={observation}
        onClose={closeProduct}
        onToggleAddon={toggleAddon}
        onQuantityChange={setQuantity}
        onObservationChange={setObservation}
        onAddToCart={addToCart}
        calculateProductTotal={calculateProductTotal}
      />
      <CheckoutDrawer
        isOpen={isCartOpen}
        step={step}
        primaryColor={primaryColor}
        cart={cart}
        cartSubtotal={cartSubtotal}
        customerName={customerName}
        customerPhone={customerPhone}
        savedAddresses={savedAddresses}
        usingSavedAddress={usingSavedAddress}
        address={address}
        calculatingFee={calculatingFee}
        deliveryInfo={deliveryInfo}
        hasAddressMinimum={hasAddressMinimum}
        couponCode={couponCode}
        appliedCoupon={appliedCoupon}
        verifyingCoupon={verifyingCoupon}
        discountAmount={discountAmount}
        feeValue={feeValue}
        finalTotal={finalTotal}
        paymentMethod={paymentMethod}
        changeFor={changeFor}
        isSubmitting={isSubmitting}
        onClose={() => setIsCartOpen(false)}
        onBackToCart={() => setStep("cart")}
        onBackToAddress={() => setStep("address")}
        onStepChange={setStep}
        onRemoveFromCart={removeFromCart}
        onCustomerNameChange={setCustomerName}
        onCustomerPhoneChange={setCustomerPhone}
        onAddressChange={setAddress}
        onBlurCep={handleBlurCep}
        onCalculateDelivery={calculateDeliveryForAddress}
        onSelectSavedAddress={selectSavedAddress}
        onUseAnotherAddress={() => {
          setUsingSavedAddress(false);
          setAddress(EMPTY_ADDRESS);
          setDeliveryInfo(null);
          setClientCoords(null);
        }}
        onCouponCodeChange={setCouponCode}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponCode("");
        }}
        onPaymentMethodChange={setPaymentMethod}
        onChangeForChange={setChangeFor}
        onPlaceOrder={handlePlaceOrder}
      />
    </div>
  );
}
