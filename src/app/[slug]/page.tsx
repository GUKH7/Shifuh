"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clock3,
  CreditCard,
  ImageIcon,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Star,
  X,
  ChevronDown,
  Phone,
  UserRound,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { calculateDistance, calculateDeliveryFee, getCoordinates } from "@/lib/geo";
import { useToast } from "@/components/ui/toast-provider";
import { CheckoutDrawer } from "@/features/storefront/CheckoutDrawer";
import { ProductPicker } from "@/features/storefront/ProductPicker";
import { EMPTY_ADDRESS } from "@/features/storefront/constants";
import { formatMoney, getContrastTextColor, hexToRgba } from "@/features/storefront/format";
import {
  getBestSellerProductId,
  isHomologationCategory,
  productMatchesSearch,
} from "@/features/storefront/catalog-navigation";
import {
  formatDeliveryEstimate,
  formatServiceRegion,
  formatTodayHours,
  getStoreStatus,
} from "@/features/storefront/store-summary";
import type { CheckoutStep, DeliveryInfo, OrderResponse } from "@/features/storefront/types";
import { useCart } from "@/features/storefront/use-cart";
import { useStorefront } from "@/features/storefront/use-storefront";
import { useCheckoutAnalytics } from "@/features/storefront/use-checkout-analytics";
import {
  formatCep,
  formatPhone,
  getChangeForError,
  isCompleteCheckoutAddress,
  isValidCep,
  isValidPhone,
  onlyDigits,
  type StorefrontPaymentMethod,
} from "@/features/storefront/checkout-format";
import { getFriendlyStorefrontError, getOrderApiErrorMessage } from "@/features/storefront/errors";

export default function StorePage() {
  const params = useParams<{ slug: string | string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { showToast } = useToast();
  const [usingSavedAddress, setUsingSavedAddress] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [isCatalogNavCompact, setIsCatalogNavCompact] = useState(false);
  const [storeClock, setStoreClock] = useState(() => new Date());
  const categoryNavRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<CheckoutStep>("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [deliveryError, setDeliveryError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<StorefrontPaymentMethod>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [cashNeedsChange, setCashNeedsChange] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [couponError, setCouponError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<OrderResponse | null>(null);
  const orderAttemptKeyRef = useRef<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    value: number;
    type: string;
  } | null>(null);
  const [verifyingCoupon, setVerifyingCoupon] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setStoreClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateCatalogNavDensity = () => setIsCatalogNavCompact(window.scrollY > 240);
    updateCatalogNavDensity();
    window.addEventListener("scroll", updateCatalogNavDensity, { passive: true });
    return () => window.removeEventListener("scroll", updateCatalogNavDensity);
  }, []);

  const handleCustomerLoaded = useCallback((profile: { name: string; phone: string }) => {
    setCustomerName(profile.name);
    setCustomerPhone(formatPhone(profile.phone));
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

  useEffect(() => {
    if (!activeCategory) return;
    const container = categoryNavRef.current;
    const tab = container?.querySelector<HTMLElement>(`[data-category-tab="${activeCategory}"]`);
    if (!container || !tab) return;

    container.scrollTo({
      left: Math.max(0, tab.offsetLeft - (container.clientWidth - tab.offsetWidth) / 2),
      behavior: "smooth",
    });
  }, [activeCategory]);

  const navigateToCategory = useCallback((categoryId: string) => {
    const section = document.getElementById(`cat-${categoryId}`);
    if (!section) return;

    setActiveCategory(categoryId);
    const stickyNavigationHeight = (
      categoryNavRef.current?.closest("[data-catalog-nav]") as HTMLElement | null
    )?.offsetHeight || 88;
    const targetTop = section.getBoundingClientRect().top + window.scrollY - stickyNavigationHeight - 16;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, [setActiveCategory]);

  const {
    selectedProduct,
    addonSelections,
    quantity,
    observation,
    editingCartItemId,
    cart,
    cartSubtotal,
    setQuantity,
    setObservation,
    openProduct,
    editCartItem,
    closeProduct,
    toggleAddon,
    calculateProductTotal,
    addToCart,
    removeFromCart,
    clearCart,
    cartQuantity,
    updateCartItemQuantity,
  } = useCart(`gestor-delivery:cart:${slug || "store"}`);
  const { markCompleted, trackError } = useCheckoutAnalytics({
    restaurantId: restaurant?.id,
    isOpen: isCartOpen,
    step,
    cartQuantity,
  });

  const calculateDeliveryForAddress = async (addressData: typeof EMPTY_ADDRESS) => {
    if (!isCompleteCheckoutAddress(addressData)) {
      setDeliveryInfo(null);
      setDeliveryError("Complete CEP, rua, número, bairro, cidade e UF para calcular a entrega.");
      return;
    }
    if (!restoCoords) {
      setDeliveryInfo(null);
      setDeliveryError("A loja não conseguiu calcular a entrega agora. Tente novamente em instantes.");
      return;
    }

    setCalculatingFee(true);
    setDeliveryError("");

    try {
      const clientCoords = await getCoordinates({
        postalCode: addressData.cep,
        street: addressData.street,
        number: addressData.number === "S/N" ? undefined : addressData.number,
        neighborhood: addressData.neighborhood,
        city: addressData.city,
        state: addressData.state,
      });

      if (clientCoords) {
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
          addressValidated: true,
        });
      } else {
        setDeliveryInfo(null);
        trackError("address_not_found");
        setDeliveryError("Não encontramos uma localização compatível com este endereço. Confira os campos e tente novamente.");
      }
    } catch (error) {
      console.error(error);
      setDeliveryInfo(null);
      trackError("geocoding_unavailable");
      setDeliveryError(getFriendlyStorefrontError("delivery"));
    } finally {
      setCalculatingFee(false);
    }
  };

  const handleBlurCep = async () => {
    const cepLimpo = address.cep.replace(/\D/g, "");
    if (cepLimpo.length < 8) return;

    setDeliveryInfo(null);
    setDeliveryError("");

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (!data.erro) {
        setAddress((prev) => ({
          ...prev,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        }));
      } else {
        setDeliveryError(getFriendlyStorefrontError("cep"));
      }
    } catch (error) {
      console.error(error);
      setDeliveryError(getFriendlyStorefrontError("cep"));
    }
  };

  const feeValue = deliveryInfo?.valid ? deliveryInfo.price : 0;
  const hasAddressMinimum = isCompleteCheckoutAddress(address);
  const handleAddressChange = (nextAddress: typeof EMPTY_ADDRESS) => {
    const deliveryAddressChanged =
      nextAddress.cep !== address.cep ||
      nextAddress.street !== address.street ||
      nextAddress.number !== address.number ||
      nextAddress.neighborhood !== address.neighborhood ||
      nextAddress.city !== address.city ||
      nextAddress.state !== address.state;

    setAddress(nextAddress);
    setCheckoutError("");
    if (deliveryAddressChanged) {
      setDeliveryInfo(null);
      setDeliveryError("");
    }
  };
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
    if (!couponCode.trim()) {
      setCouponError("Digite o código do cupom.");
      return;
    }

    setCouponError("");
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
        setCouponError("Cupom não encontrado ou indisponível.");
      } else {
        setAppliedCoupon({
          code: data.code,
          value: data.value,
          type: data.discount_type,
        });
        setCouponError("");
      }
    } catch (error) {
      console.error(error);
      setCouponError("Não foi possível validar o cupom agora. Tente novamente.");
    } finally {
      setVerifyingCoupon(false);
    }
  };

  const handlePlaceOrder = async () => {
    setCheckoutError("");
    if (!customerName || !customerPhone || !address.street || !address.number) {
      showToast({
        title: "Dados incompletos",
        description: "Preencha nome, WhatsApp e endereço para continuar.",
        tone: "error",
      });
      return;
    }
    if (!isValidPhone(customerPhone)) {
      showToast({ title: "WhatsApp inválido", description: "Informe um telefone com DDD.", tone: "error" });
      return;
    }
    if (!isValidCep(address.cep)) {
      showToast({ title: "CEP inválido", description: "Informe os 8 números do CEP.", tone: "error" });
      return;
    }
    if (!hasAddressMinimum) {
      showToast({
        title: "Endereço incompleto",
        description: "Complete CEP, rua, número, bairro, cidade e UF.",
        tone: "error",
      });
      return;
    }
    if (!deliveryInfo?.valid || !deliveryInfo.addressValidated) {
      setStep("address");
      setDeliveryError("Calcule novamente a taxa e o prazo para continuar.");
      showToast({
        title: "Entrega ainda não validada",
        description: "Confira o endereço e calcule a entrega antes de confirmar.",
        tone: "error",
      });
      return;
    }
    if (cartSubtotal < minimumOrderAmount) {
      showToast({
        title: "Pedido mínimo não atingido",
        description: `Adicione mais ${formatMoney(minimumOrderAmount - cartSubtotal)} para continuar.`,
        tone: "error",
      });
      return;
    }
    if (storeStatus.tone === "closed" && !scheduledOrdersEnabled) {
      showToast({
        title: "Loja fechada",
        description: "Sua sacola foi mantida. Volte quando a loja estiver aberta.",
        tone: "error",
      });
      return;
    }
    if (storeStatus.tone === "closed" && scheduledOrdersEnabled && !scheduledFor) {
      showToast({
        title: "Escolha um horário",
        description: "A loja está fechada agora, mas aceita pedidos agendados.",
        tone: "error",
      });
      return;
    }
    if (paymentMethod === "cash" && cashNeedsChange) {
      const changeError = getChangeForError(changeFor, finalTotal);
      if (changeError) {
        setCheckoutError(changeError);
        return;
      }
    }

    setIsSubmitting(true);
    const idempotencyKey = orderAttemptKeyRef.current || crypto.randomUUID();
    orderAttemptKeyRef.current = idempotencyKey;

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerName,
          customerPhone: onlyDigits(customerPhone),
          address,
          paymentMethod,
          changeFor: paymentMethod === "cash" && cashNeedsChange ? changeFor : "",
          couponCode: appliedCoupon?.code || null,
          usingSavedAddress,
          saveAddress,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
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
        const message = getOrderApiErrorMessage(result?.code);
        trackError(String(result?.code || "order_rejected").toLowerCase());
        setCheckoutError(message);
        if (["INCOMPLETE_ADDRESS", "ADDRESS_NOT_FOUND", "OUTSIDE_DELIVERY_AREA", "DELIVERY_CALCULATION_UNAVAILABLE"].includes(result?.code)) {
          if (result?.code === "OUTSIDE_DELIVERY_AREA") {
            setDeliveryInfo({
              price: 0,
              time: 0,
              distance: Number(result?.distance) || 0,
              valid: false,
              addressValidated: true,
            });
            setDeliveryError("");
          } else {
            setDeliveryInfo(null);
            setDeliveryError(message);
          }
          setStep("address");
        }
        showToast({
          title: "Não foi possível finalizar o pedido",
          description: message,
          tone: "error",
        });
        return;
      }

      const completedOrder = result as OrderResponse;
      markCompleted();
      setCheckoutError("");
      setCompletedOrder(completedOrder);
      window.localStorage.setItem(
        `gestor-delivery:last-order:${slug || restaurant.id}`,
        JSON.stringify({
          orderId: completedOrder.orderId,
          displayNumber: completedOrder.displayNumber,
          trackingPath: completedOrder.trackingPath,
          trackingUrl: completedOrder.trackingUrl,
          savedAt: new Date().toISOString(),
        }),
      );
      setStep("success");
    } catch (error: any) {
      trackError("order_request_failed");
      setCheckoutError(getFriendlyStorefrontError("order"));
      showToast({
        title: "Não foi possível finalizar o pedido",
        description: getFriendlyStorefrontError("order"),
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishCompletedOrder = () => {
    clearCart();
    setAppliedCoupon(null);
    setCouponCode("");
    setScheduledFor("");
    setSaveAddress(false);
    setCompletedOrder(null);
    orderAttemptKeyRef.current = null;
  };

  const handleTrackCompletedOrder = () => {
    if (!completedOrder) return;
    const trackingPath = completedOrder.trackingPath;
    finishCompletedOrder();
    router.replace(trackingPath);
  };

  const handleFinishCompletedOrder = () => {
    finishCompletedOrder();
    setStep("cart");
    setIsCartOpen(false);
  };

  const selectSavedAddress = async (savedAddr: any) => {
    const nextAddress = {
      cep: formatCep(savedAddr.cep || ""),
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
    setAppliedCoupon(null);
  };

  const contrastColor = storefrontTheme.contrast_color || "#1f2937";
  const pageBackground = "#f5f6f7";
  const brandTextColor = getContrastTextColor(primaryColor || "#ff5a1f");
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
      ? "h-[120px] sm:h-[240px]"
      : storefrontTheme.hero_style === "split"
        ? "h-[116px] sm:h-[220px]"
        : "h-[108px] sm:h-[200px]";
  const totalProducts = products.length;
  const featuredProduct = products[0] || null;
  const hasFreeDelivery = deliveryTiers.some((tier: any) => Number(tier.price || 0) === 0);
  const startingDeliveryFee = deliveryTiers.length > 0
    ? Math.min(...deliveryTiers.map((tier: any) => Math.max(0, Number(tier.price) || 0)))
    : 0;
  const deliveryFeeLabel = hasFreeDelivery || deliveryTiers.length === 0
    ? "Entrega grátis"
    : `Entrega a partir de ${formatMoney(startingDeliveryFee)}`;
  const deliveryEstimate = formatDeliveryEstimate(deliveryTiers);
  const serviceRegion = formatServiceRegion(restaurant || {});
  const storeStatus = getStoreStatus(restaurant?.work_hours, storeClock);
  const minimumOrderAmount = Math.max(0, Number(restaurant?.minimum_order_amount) || 0);
  const scheduledOrdersEnabled = Boolean(restaurant?.scheduled_orders_enabled);
  const scheduledOrderLeadMinutes = Math.max(
    30,
    Number(restaurant?.scheduled_order_lead_minutes) || 60,
  );
  const minimumScheduleDate = new Date(storeClock.getTime() + scheduledOrderLeadMinutes * 60_000);
  const minimumScheduleValue = new Date(
    minimumScheduleDate.getTime() - minimumScheduleDate.getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 16);
  const todayHours = formatTodayHours(restaurant?.work_hours, storeClock);
  const statusStyles = {
    open: "text-emerald-700 bg-emerald-50",
    closing: "text-amber-800 bg-amber-50",
    closed: "text-rose-700 bg-rose-50",
  }[storeStatus.tone];
  const statusDotStyles = {
    open: "bg-emerald-500",
    closing: "bg-amber-500",
    closed: "bg-rose-500",
  }[storeStatus.tone];
  const customerCategories = categories.filter(
    (category) =>
      !isHomologationCategory(category.name) &&
      products.some((product) => product.category_id === category.id),
  );
  const customerCategoryIds = new Set(customerCategories.map((category) => category.id));
  const customerProducts = products.filter((product) => customerCategoryIds.has(product.category_id));
  const bestSellerProductId = getBestSellerProductId(customerProducts);
  const visibleProducts = customerProducts.filter((product) => productMatchesSearch(product, menuSearch));
  const displayedCategories = customerCategories.filter((category) =>
    visibleProducts.some((product) => product.category_id === category.id),
  );

  useEffect(() => {
    if (displayedCategories.length === 0) return;
    if (!displayedCategories.some((category) => category.id === activeCategory)) {
      setActiveCategory(displayedCategories[0].id);
    }
  }, [activeCategory, displayedCategories, setActiveCategory]);

  if (loading) {
    return (
      <div className="min-h-screen animate-pulse bg-[#f6f1ea]">
        <div className="mx-auto max-w-5xl bg-white pb-5 sm:px-4">
          <div className="h-[136px] rounded-b-[18px] bg-gray-200 sm:h-[200px] sm:rounded-b-[28px]" />
          <div className="flex items-end gap-4 px-4">
            <div className="-mt-7 h-16 w-16 rounded-[18px] border-4 border-white bg-gray-200 sm:h-20 sm:w-20" />
            <div className="flex-1 pb-2 pt-5">
              <div className="h-6 w-48 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-72 max-w-full rounded bg-gray-100" />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-6">
          <div className="h-10 rounded-xl bg-white" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex h-40 gap-4 rounded-[18px] bg-white p-4">
                <div className="flex-1 space-y-3"><div className="h-5 w-2/3 rounded bg-gray-200" /><div className="h-4 w-full rounded bg-gray-100" /><div className="h-5 w-24 rounded bg-gray-200" /></div>
                <div className="aspect-square h-full rounded-xl bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
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

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip pb-28 text-gray-950" style={{ backgroundColor: pageBackground }}>
      <section className="bg-white">
        <div className="mx-auto w-full max-w-5xl px-0 pb-3 sm:px-4 sm:pb-5">
          <div className="relative overflow-hidden rounded-b-[18px] sm:rounded-[28px]">
            <div className={`relative bg-gray-200 ${heroHeightClass}`}>
            {usesHeroBanner && banners.length > 0 ? (
              <Image
                key={banners[currentBanner]}
                src={banners[currentBanner]}
                alt={`Banner da ${restaurant.name}`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-cover"
              />
            ) : usesHeroBanner && restaurant.image_url ? (
              <Image src={restaurant.image_url} alt={restaurant.name} fill priority sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />
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
                <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-[3px] border-white bg-white shadow-[0_10px_24px_rgba(17,16,15,0.14)] sm:h-20 sm:w-20 sm:rounded-[18px] sm:border-4">
                  {restaurant.logo_url ? (
                    <Image src={restaurant.logo_url} alt={`Logo da ${restaurant.name}`} fill sizes="80px" className="object-contain p-1" />
                  ) : restaurant.image_url ? (
                    <Image src={restaurant.image_url} alt={`Logo da ${restaurant.name}`} fill sizes="80px" className="object-cover" />
                  ) : (
                    <span className="text-3xl font-black" style={{ color: primaryColor }}>
                      {restaurant.name.charAt(0)}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1 pb-1 pt-5 sm:pb-2 sm:pt-8">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="truncate pr-2 text-[20px] font-black leading-tight tracking-tight text-gray-950 sm:text-[28px]">
                    {restaurant.name}
                  </h1>
                  <div className="sm:hidden">
                    {currentUser ? (
                      <button
                        onClick={() => router.push("/minha-conta")}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Minha conta"
                        title="Minha conta"
                      >
                        <UserRound size={17} />
                      </button>
                    ) : (
                      <button
                        onClick={() => router.push(`/auth?returnUrl=${encodeURIComponent(pathname)}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Entrar na conta"
                        title="Entrar"
                      >
                        <UserRound size={17} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-bold text-gray-600 sm:mt-2.5 sm:text-sm">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${statusStyles}`}>
                    <span className={`h-2 w-2 rounded-full ${statusDotStyles}`} />
                    {storeStatus.label}
                  </span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span>{deliveryEstimate}</span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span>{deliveryFeeLabel}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-medium text-gray-500 sm:mt-3 sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <ShoppingBag size={14} className="shrink-0 text-gray-400" />
                {minimumOrderAmount > 0
                  ? `Pedido mínimo ${formatMoney(minimumOrderAmount)}`
                  : "Sem pedido mínimo"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard size={14} className="shrink-0 text-gray-400" />
                Pix, cartão e dinheiro
              </span>
              {storefrontTheme.show_reviews && Number(restaurant.rating_count || 0) > 0 && Number(restaurant.rating_average || 0) > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  {Number(restaurant.rating_average).toFixed(1)}
                </span>
              )}
            </div>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-bold text-gray-600 sm:text-sm">
                <span>Informações da loja</span>
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-2 pb-2 text-xs text-gray-600 sm:grid-cols-2 sm:text-sm">
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={15} className="shrink-0 text-gray-400" />
                  {todayHours}
                </span>
                {restaurant.phone && (
                  <a className="inline-flex items-center gap-2 hover:underline" href={`tel:${restaurant.phone}`}>
                    <Phone size={15} className="shrink-0 text-gray-400" />
                    {formatPhone(restaurant.phone)}
                  </a>
                )}
                <span className="inline-flex items-center gap-2 sm:col-span-2">
                  <MapPin size={15} className="shrink-0 text-gray-400" />
                  {[restaurant.address_street, restaurant.address_number, serviceRegion].filter(Boolean).join(", ")}
                </span>
              </div>
            </details>
          </div>

        </div>
      </section>

      <div data-catalog-nav className="sticky top-0 z-30 w-full min-w-0 overflow-hidden border-b border-gray-200 bg-white transition-[padding,box-shadow] duration-200">
        <div className={`mx-auto w-full min-w-0 max-w-5xl px-2.5 transition-all duration-200 sm:px-6 ${isCatalogNavCompact ? "py-1 shadow-[0_5px_16px_rgba(17,16,15,0.05)]" : "py-2"}`}>
          <div className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-[#f7f7f7] px-3 transition-all duration-200 sm:gap-2.5 sm:px-3.5 ${isCatalogNavCompact ? "mb-1 h-8" : "mb-2 h-9 sm:mb-2.5 sm:h-10"}`}>
            <Search size={16} className="text-gray-400" />
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Buscar no cardápio"
              className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-gray-400 sm:text-sm"
            />
            {menuSearch && (
              <button onClick={() => setMenuSearch("")} className="text-gray-400">
                <X size={16} />
              </button>
            )}
          </div>
          <div ref={categoryNavRef} className="flex w-full min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {displayedCategories.map((category) => (
              <button
                key={category.id}
                data-category-tab={category.id}
                aria-current={activeCategory === category.id ? "true" : undefined}
                onClick={() => navigateToCategory(category.id)}
                className={`max-w-[75vw] shrink-0 truncate whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition-all duration-200 sm:max-w-none sm:text-sm ${isCatalogNavCompact ? "min-h-8 py-1.5" : "min-h-10 py-2"} ${
                  activeCategory === category.id
                    ? "border-transparent text-gray-950"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
                style={
                  activeCategory === category.id
                    ? { backgroundColor: hexToRgba(primaryColor || "#ff5a1f", 0.14), color: primaryColor }
                    : undefined
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full min-w-0 max-w-5xl px-2.5 py-3 sm:px-6 sm:py-5">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {menuSearch && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700">
                {visibleProducts.length} resultado(s) para &quot;{menuSearch}&quot;
              </div>
            )}

            {displayedCategories.map((category) => {
              const categoryProducts = visibleProducts.filter((product) => product.category_id === category.id);
              const isExpanded = expandedCategories.has(category.id);
              const visibleCategoryProducts = menuSearch || isExpanded
                ? categoryProducts
                : categoryProducts.slice(0, 12);
              const hiddenProductCount = categoryProducts.length - visibleCategoryProducts.length;
              if (categoryProducts.length === 0) return null;

              return (
                <section key={category.id} id={`cat-${category.id}`} data-category-section className="catalog-section w-full min-w-0 scroll-mt-28">
                  <div className="px-1 pb-2 pt-1 sm:px-1 sm:pb-3">
                    <h2 className="break-words text-[15px] font-black text-gray-950 sm:text-[17px]">{category.name}</h2>
                    <p className="mt-0.5 text-[10px] font-medium text-gray-500 sm:text-[11px]">{categoryProducts.length} itens</p>
                  </div>

                  <div
                    className={
                      storefrontTheme.catalog_layout === "list"
                        ? "space-y-2.5"
                        : `space-y-2.5 sm:grid sm:gap-3 sm:space-y-0 ${catalogGridClass}`
                    }
                  >
                    {visibleCategoryProducts.map((product) => {
                      const hasPaidAddons = product.addons?.some((group: any) =>
                        Array.isArray(group?.options)
                          ? group.options.some((option: any) => Number(option?.price) > 0)
                          : Number(group?.price) > 0,
                      );

                      return (
                        <button
                          key={product.id}
                          data-product-card
                          onClick={() => product.is_active && openProduct(product)}
                          disabled={!product.is_active}
                          className={`group relative text-left transition-all ${product.is_active ? "hover:-translate-y-0.5" : "cursor-not-allowed"} ${
                            storefrontTheme.catalog_layout === "list"
                              ? "flex w-full min-w-0 gap-3 overflow-hidden rounded-2xl border border-white/80 bg-white px-4 py-4 shadow-[0_5px_18px_rgba(17,16,15,0.05)] hover:bg-[#fffdfa] min-[380px]:gap-4 sm:px-5 sm:py-5"
                              : `flex w-full min-w-0 gap-3 overflow-hidden rounded-2xl px-4 py-4 hover:bg-[#fffdfa] min-[380px]:gap-4 sm:block sm:rounded-[20px] sm:p-3 ${cardTone}`
                          }`}
                        >
                          <div className={`min-w-0 flex-1 ${product.is_active ? "" : "opacity-55"}`}>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {!product.is_active && <span className="rounded-md bg-gray-200 px-2 py-1 text-[9px] font-black uppercase text-gray-600">Indisponível</span>}
                              {product.is_promotional && <span className="rounded-md bg-rose-50 px-2 py-1 text-[9px] font-black uppercase text-rose-700">Promoção</span>}
                              {product.is_vegetarian && <span className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Vegetariano</span>}
                              {product.id === bestSellerProductId && <span className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-black uppercase text-amber-800">Mais pedido</span>}
                            </div>
                            <h3 className="break-words text-[14px] font-black leading-snug text-gray-950 [overflow-wrap:anywhere] sm:text-[16px]">{product.name}</h3>
                            <p className="mt-1.5 line-clamp-2 break-words text-[12px] leading-5 text-gray-500 [overflow-wrap:anywhere] sm:text-[13px]">{product.description}</p>
                            {!product.is_active && (
                              <p className="mt-2 text-xs font-bold text-gray-500">Temporariamente indisponível para pedidos.</p>
                            )}
                            <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                              {hasPaidAddons && <span className="text-[10px] font-bold leading-none text-gray-400">A partir de</span>}
                              <span className="text-[15px] font-black text-gray-950">{formatMoney(product.price)}</span>
                            </div>
                          </div>
                          <div className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100 ${
                            storefrontTheme.catalog_layout === "list" ? "w-20 flex-shrink-0 min-[380px]:w-24 sm:w-36" : "w-20 flex-shrink-0 min-[380px]:w-24 sm:mt-3 sm:w-full"
                          }`}>
                            {product.image_url ? (
                              <Image src={product.image_url} alt={product.name} fill sizes="(max-width: 379px) 80px, (max-width: 640px) 96px, (max-width: 1280px) 33vw, 320px" className="object-contain p-1.5" />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400">
                                <ImageIcon size={24} strokeWidth={1.7} />
                                <span className="text-[9px] font-bold uppercase">Sem foto</span>
                              </div>
                            )}
                            {product.is_active && (
                              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(17,16,15,0.14)]" style={{ color: primaryColor }}><Plus size={17} /></span>
                            )}
                            {!product.is_active && <div className="absolute inset-0 bg-white/45" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!menuSearch && categoryProducts.length > 12 && (
                    <button
                      type="button"
                      onClick={() => setExpandedCategories((current) => {
                        const next = new Set(current);
                        if (next.has(category.id)) next.delete(category.id);
                        else next.add(category.id);
                        return next;
                      })}
                      className="mt-3 flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-black text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {isExpanded ? "Mostrar menos" : `Ver mais ${hiddenProductCount} produtos`}
                    </button>
                  )}
                </section>
              );
            })}

            {visibleProducts.length === 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
                {menuSearch ? <Search className="mx-auto text-gray-300" size={36} /> : <ShoppingBag className="mx-auto text-gray-300" size={36} />}
                <p className="mt-3 font-bold text-gray-900">
                  {menuSearch ? "Nenhum item encontrado" : "Cardápio sendo preparado"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {menuSearch
                    ? "Tente buscar por outro nome, descrição ou complemento."
                    : "A loja ainda não publicou itens disponíveis. Volte novamente em breve."}
                </p>
                {menuSearch && (
                  <button onClick={() => setMenuSearch("")} className="mt-4 text-sm font-black" style={{ color: primaryColor }}>
                    Limpar busca
                  </button>
                )}
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
                    <div key={item.internalId} className="border-b border-gray-100 pb-3 text-sm last:border-0">
                      <div className="flex justify-between gap-3">
                        <span className="line-clamp-1 font-medium text-gray-700">{item.product.name}</span>
                        <span className="shrink-0 font-bold text-gray-950">{formatMoney(item.totalPrice)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-1.5 py-1">
                          <button onClick={() => updateCartItemQuantity(item.internalId, item.quantity - 1)} className="p-0.5 text-gray-500" aria-label={`Diminuir ${item.product.name}`}><Minus size={13} /></button>
                          <span className="min-w-4 text-center text-xs font-black">{item.quantity}</span>
                          <button onClick={() => updateCartItemQuantity(item.internalId, item.quantity + 1)} className="p-0.5" style={{ color: primaryColor }} aria-label={`Aumentar ${item.product.name}`}><Plus size={13} /></button>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => editCartItem(item)} className="text-xs font-bold" style={{ color: primaryColor }}>Editar</button>
                          <button onClick={() => removeFromCart(item.internalId)} className="text-xs font-bold text-gray-400 hover:text-rose-600">Remover</button>
                        </div>
                      </div>
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
        <div className="fixed bottom-3 left-0 right-0 z-40 px-3 sm:bottom-4 sm:px-6 lg:hidden">
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => {
                setStep("cart");
                setIsCartOpen(true);
              }}
              className="w-full rounded-2xl border border-white/80 bg-[#fffdfa] p-2.5 text-gray-950 shadow-[0_14px_36px_rgba(17,16,15,0.16)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: hexToRgba(primaryColor, 0.12), color: primaryColor }}>
                    <ShoppingBag size={18} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-black">Sacola · {cartQuantity} {cartQuantity === 1 ? "item" : "itens"}</p>
                    <p className="text-sm font-bold text-gray-600">{formatMoney(cartSubtotal)}</p>
                  </div>
                </div>
                <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-black" style={{ backgroundColor: primaryColor, color: brandTextColor }}>
                  Ver pedido <ArrowRight size={15} />
                </span>
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
        isEditing={Boolean(editingCartItemId)}
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
        deliveryError={deliveryError}
        couponCode={couponCode}
        appliedCoupon={appliedCoupon}
        verifyingCoupon={verifyingCoupon}
        discountAmount={discountAmount}
        feeValue={feeValue}
        finalTotal={finalTotal}
        paymentMethod={paymentMethod}
        changeFor={changeFor}
        cashNeedsChange={cashNeedsChange}
        checkoutError={checkoutError}
        completedOrder={completedOrder}
        couponError={couponError}
        isSubmitting={isSubmitting}
        saveAddress={saveAddress}
        canSaveAddress={Boolean(currentUser)}
        storeStatus={storeStatus}
        minimumOrderAmount={minimumOrderAmount}
        scheduledOrdersEnabled={scheduledOrdersEnabled}
        minimumScheduleValue={minimumScheduleValue}
        scheduledFor={scheduledFor}
        onClose={() => setIsCartOpen(false)}
        onBackToCart={() => setStep("cart")}
        onBackToAddress={() => setStep("address")}
        onStepChange={setStep}
        onRemoveFromCart={removeFromCart}
        onCartItemQuantityChange={updateCartItemQuantity}
        onEditCartItem={(item) => {
          editCartItem(item);
          setIsCartOpen(false);
        }}
        onCustomerNameChange={(value) => { setCustomerName(value); setCheckoutError(""); }}
        onCustomerPhoneChange={(value) => { setCustomerPhone(value); setCheckoutError(""); }}
        onAddressChange={handleAddressChange}
        onBlurCep={handleBlurCep}
        onCalculateDelivery={calculateDeliveryForAddress}
        onRetryDelivery={() => calculateDeliveryForAddress(address)}
        onSelectSavedAddress={selectSavedAddress}
        onUseAnotherAddress={() => {
          setUsingSavedAddress(false);
          setAddress(EMPTY_ADDRESS);
          setDeliveryInfo(null);
          setDeliveryError("");
        }}
        onCouponCodeChange={(value) => { setCouponCode(value); setCouponError(""); }}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponCode("");
          setCouponError("");
        }}
        onPaymentMethodChange={(value) => { setPaymentMethod(value); setCheckoutError(""); }}
        onChangeForChange={(value) => { setChangeFor(value); setCheckoutError(""); }}
        onCashNeedsChange={(value) => { setCashNeedsChange(value); setCheckoutError(""); }}
        onSaveAddressChange={setSaveAddress}
        onScheduledForChange={(value) => { setScheduledFor(value); setCheckoutError(""); }}
        onPlaceOrder={handlePlaceOrder}
        onTrackOrder={handleTrackCompletedOrder}
        onFinishOrder={handleFinishCompletedOrder}
      />
    </div>
  );
}
